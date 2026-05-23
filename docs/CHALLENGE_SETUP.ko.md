# 영어/운동 챌린지 셋업 가이드

주 4회 챌린지 출석과 벌금(미달 1회당 10,000원) 정산을 위한 최소 구성입니다.

## 1) 규칙

- 기본 목표: 영어 `주 4회` + 운동 `주 4회` (각각)
- 벌금: `max(영어 미달, 운동 미달) * 10,000원`
- 주 시작일: 월요일(`week_start = mon`)
- 출석 단위: 영어/운동 각각 1일 1회 (하루 최대 2회)
- **휴일**: 팀원 전원 합의 시 해당 날짜는 목표에서 제외 (휴일 1일당 목표 1회 감소)

## 2) 테이블 생성 SQL

Supabase SQL Editor에서 실행하세요.

```sql
-- 회원(팀원)
CREATE TABLE IF NOT EXISTS public.challenge_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email text UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 챌린지 규칙(기본 1개 행)
CREATE TABLE IF NOT EXISTS public.challenge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '영어/운동 주간 챌린지',
  required_count_per_week integer NOT NULL DEFAULT 4 CHECK (required_count_per_week >= 0),
  penalty_per_miss integer NOT NULL DEFAULT 10000 CHECK (penalty_per_miss >= 0),
  week_start text NOT NULL DEFAULT 'mon' CHECK (week_start IN ('mon', 'sun')),
  start_date date NOT NULL DEFAULT '2026-04-27',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 출석(영어/운동 각각 1일 1회)
CREATE TABLE IF NOT EXISTS public.challenge_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.challenge_members(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('english', 'exercise')),
  attended_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, attended_on, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_challenge_attendance_member_date
  ON public.challenge_attendances (member_id, attended_on DESC);

-- 정산(주차별)
CREATE TABLE IF NOT EXISTS public.challenge_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key text NOT NULL,
  member_id uuid NOT NULL REFERENCES public.challenge_members(id) ON DELETE CASCADE,
  count_done integer NOT NULL DEFAULT 0,
  count_missed integer NOT NULL DEFAULT 0,
  penalty_amount integer NOT NULL DEFAULT 0,
  adjustment_amount integer NOT NULL DEFAULT 0,
  final_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_key, member_id)
);

-- 휴일 요청
CREATE TABLE IF NOT EXISTS public.challenge_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.challenge_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_date)
);

-- 휴일 투표
CREATE TABLE IF NOT EXISTS public.challenge_holiday_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_id uuid NOT NULL REFERENCES public.challenge_holidays(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.challenge_members(id) ON DELETE CASCADE,
  vote boolean NOT NULL, -- true: 동의, false: 거부
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_id, member_id)
);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION public.challenge_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS challenge_members_touch ON public.challenge_members;
CREATE TRIGGER challenge_members_touch
BEFORE UPDATE ON public.challenge_members
FOR EACH ROW EXECUTE FUNCTION public.challenge_touch_updated_at();

DROP TRIGGER IF EXISTS challenge_rules_touch ON public.challenge_rules;
CREATE TRIGGER challenge_rules_touch
BEFORE UPDATE ON public.challenge_rules
FOR EACH ROW EXECUTE FUNCTION public.challenge_touch_updated_at();

DROP TRIGGER IF EXISTS challenge_settlements_touch ON public.challenge_settlements;
CREATE TRIGGER challenge_settlements_touch
BEFORE UPDATE ON public.challenge_settlements
FOR EACH ROW EXECUTE FUNCTION public.challenge_touch_updated_at();

DROP TRIGGER IF EXISTS challenge_holidays_touch ON public.challenge_holidays;
CREATE TRIGGER challenge_holidays_touch
BEFORE UPDATE ON public.challenge_holidays
FOR EACH ROW EXECUTE FUNCTION public.challenge_touch_updated_at();

-- 기본 룰 1건 보장
INSERT INTO public.challenge_rules (title, required_count_per_week, penalty_per_miss, week_start, active)
SELECT '영어/운동 주간 챌린지', 4, 10000, 'mon', true
WHERE NOT EXISTS (SELECT 1 FROM public.challenge_rules WHERE active = true);
```

## 3) RLS 정책

아래는 **정산(write) 권한을 특정 관리자 이메일로 제한**한 버전입니다.
현재 관리자 이메일: `mylifeforcoding@gmail.com`

```sql
ALTER TABLE public.challenge_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_holiday_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "challenge_rules_read" ON public.challenge_rules;
DROP POLICY IF EXISTS "challenge_rules_write_auth" ON public.challenge_rules;
DROP POLICY IF EXISTS "challenge_members_read_auth" ON public.challenge_members;
DROP POLICY IF EXISTS "challenge_members_insert_auth" ON public.challenge_members;
DROP POLICY IF EXISTS "challenge_members_update_own" ON public.challenge_members;
DROP POLICY IF EXISTS "challenge_attendance_read_auth" ON public.challenge_attendances;
DROP POLICY IF EXISTS "challenge_attendance_insert_own" ON public.challenge_attendances;
DROP POLICY IF EXISTS "challenge_attendance_update_own" ON public.challenge_attendances;
DROP POLICY IF EXISTS "challenge_attendance_delete_own" ON public.challenge_attendances;
DROP POLICY IF EXISTS "challenge_settlement_read_auth" ON public.challenge_settlements;
DROP POLICY IF EXISTS "challenge_settlement_write_auth" ON public.challenge_settlements;
DROP POLICY IF EXISTS "challenge_settlement_write_admin_email" ON public.challenge_settlements;
DROP POLICY IF EXISTS "challenge_holidays_read_auth" ON public.challenge_holidays;
DROP POLICY IF EXISTS "challenge_holidays_insert_auth" ON public.challenge_holidays;
DROP POLICY IF EXISTS "challenge_holidays_update_approved" ON public.challenge_holidays;
DROP POLICY IF EXISTS "challenge_holiday_votes_read_auth" ON public.challenge_holiday_votes;
DROP POLICY IF EXISTS "challenge_holiday_votes_insert_own" ON public.challenge_holiday_votes;
DROP POLICY IF EXISTS "challenge_holiday_votes_update_own" ON public.challenge_holiday_votes;

-- rules: 모두 읽기 가능, 인증 사용자만 수정
CREATE POLICY "challenge_rules_read" ON public.challenge_rules
FOR SELECT USING (true);

CREATE POLICY "challenge_rules_write_auth" ON public.challenge_rules
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- members: 로그인 사용자는 전체 조회 가능, 본인 프로필 upsert 가능
CREATE POLICY "challenge_members_read_auth" ON public.challenge_members
FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_members_insert_auth" ON public.challenge_members
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "challenge_members_update_own" ON public.challenge_members
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- attendances: 로그인 사용자는 전체 조회 가능(팀 현황용), 본인만 작성/수정
CREATE POLICY "challenge_attendance_read_auth" ON public.challenge_attendances
FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_attendance_insert_own" ON public.challenge_attendances
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "challenge_attendance_update_own" ON public.challenge_attendances
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "challenge_attendance_delete_own" ON public.challenge_attendances
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- settlements: 로그인 사용자 조회 가능, 인증 사용자 쓰기 가능(팀 운영자 관리)
CREATE POLICY "challenge_settlement_read_auth" ON public.challenge_settlements
FOR SELECT TO authenticated USING (true);

-- settlements: 정산 쓰기 권한은 관리자 이메일만 허용
CREATE POLICY "challenge_settlement_write_admin_email" ON public.challenge_settlements
FOR ALL TO authenticated
USING (lower((auth.jwt() ->> 'email')) IN ('mylifeforcoding@gmail.com'))
WITH CHECK (lower((auth.jwt() ->> 'email')) IN ('mylifeforcoding@gmail.com'));

-- holidays: 로그인 사용자 조회 가능, 팀원 요청 가능, 승인된 것만 수정 가능
CREATE POLICY "challenge_holidays_read_auth" ON public.challenge_holidays
FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_holidays_insert_auth" ON public.challenge_holidays
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "challenge_holidays_update_approved" ON public.challenge_holidays
FOR UPDATE TO authenticated
USING (status = 'approved')
WITH CHECK (status = 'approved');

-- holiday_votes: 로그인 사용자 조회 가능, 본인만 투표/수정
CREATE POLICY "challenge_holiday_votes_read_auth" ON public.challenge_holiday_votes
FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_holiday_votes_insert_own" ON public.challenge_holiday_votes
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "challenge_holiday_votes_update_own" ON public.challenge_holiday_votes
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);
```

> 운영 시 관리자 이메일이 여러 개면 `IN ('a@x.com','b@x.com')` 형태로 추가하세요.
> 보안상 최종 권한은 반드시 RLS가 책임지므로, 프론트엔드의 이메일 체크와 함께 두 군데를 같이 맞춰야 합니다.

## 4) Storage (인증샷 업로드)

Supabase Dashboard → Storage에서 `challenge-proofs` 버킷을 생성하세요.

1. **New bucket** 클릭
2. Name: `challenge-proofs`
3. **Public bucket** 체크 (팀원끼리 인증샷 확인용)
4. File size limit: `5MB`
5. Allowed MIME types: `image/*`

생성 후 아래 RLS를 SQL Editor에서 실행:

```sql
CREATE POLICY "challenge_proofs_read" ON storage.objects
FOR SELECT USING (bucket_id = 'challenge-proofs');

CREATE POLICY "challenge_proofs_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'challenge-proofs');

CREATE POLICY "challenge_proofs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'challenge-proofs');
```

## 5) 화면

- `challenge.html`: 팀원 출석 체크 + 인증샷 업로드 + 휴일 요청/동의
- `challenge-admin.html`: 주간 집계/정산 + 휴일 관리

두 페이지 모두 Supabase 이메일/비밀번호 로그인 기반입니다.

## 6) 휴일 시스템

팀원 간 합의로 쉬는 날을 지정할 수 있습니다.

**승인 조건:**
- 팀원 전원 동의 시 승인 (2명 팀 → 2명 동의 필요)
- 1명이라도 거부하면 거부됨

**정산 반영:**
- 승인된 휴일은 해당 주의 목표에서 제외
- 예: 주 4회 목표 + 휴일 1일 = 주 3회 목표로 조정

**UI 흐름:**
1. 팀원이 `challenge.html`에서 휴일 요청 (날짜, 사유)
2. 다른 팀원이 동의/거부 투표
3. 전원 동의 시 자동 승인
4. 정산 시 휴일이 반영된 목표로 계산
5. 관리자는 `challenge-admin.html`에서 휴일 관리 가능
