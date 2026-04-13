## 파티션 : Consumer 비율

꼭 그렇지는 않습니다.

### 기본 규칙

파티션 1개는 한 그룹 내에서 **최대 Consumer 1개만** 담당 가능

```
파티션 3개, Consumer 3개 → 이상적
  Partition 0 → Consumer A
  Partition 1 → Consumer B
  Partition 2 → Consumer C

파티션 3개, Consumer 2개 → Consumer가 파티션 여러 개 담당
  Partition 0 → Consumer A
  Partition 1 → Consumer A  (A가 2개 담당)
  Partition 2 → Consumer B

파티션 3개, Consumer 5개 → Consumer 2개는 놀음 (idle)
  Consumer D, E → 대기
```

### 실무 설계 기준

```
파티션 12개, Consumer 3개 (평상시)
  → 트래픽 폭증 시 Consumer를 12개까지 늘리면 즉시 1:1
  → 파티션은 건드릴 필요 없음
```

| | 파티션 | Consumer |
|---|---|---|
| 무엇을 해결 | 브로커의 저장/I/O 분산 | 애플리케이션의 처리 속도 |
| 변경 난이도 | 어려움 (인프라 변경) | 쉬움 (서버 대수 조절) |

- **파티션 수** = 확장 가능한 최대치 (처음에 여유있게)
- **Consumer 수** = 현재 트래픽에 맞게 운영
