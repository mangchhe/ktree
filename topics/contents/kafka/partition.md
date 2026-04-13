## Partition

토픽을 나눈 물리적 단위입니다. 병렬 처리를 가능하게 합니다.

```
sirius-iam-realms-tap-service-user
  ├── Partition 0
  ├── Partition 1
  └── Partition 2
```

### 파티션은 두 가지 문제를 해결합니다

**브로커(서버) 쪽 — 저장/I/O 분산**

```
파티션 1개
  Broker 1: [모든 메시지 다 저장]
  → 디스크 한 대 용량 한계
  → 읽기/쓰기 I/O 한 대에 집중

파티션 3개
  Broker 1: Partition 0 저장
  Broker 2: Partition 1 저장
  Broker 3: Partition 2 저장
  → 저장 용량 분산, I/O 분산
```

**애플리케이션 쪽 — 처리량 향상**

```
파티션 4개
  Partition 0 → Consumer A  ┐
  Partition 1 → Consumer B  │ 4배 병렬 처리
  Partition 2 → Consumer C  │
  Partition 3 → Consumer D  ┘
```

> 파티션 수는 한번 정해지면 운영 중에 쉽게 못 바꿉니다. 처음에 여유있게 설계하세요.
