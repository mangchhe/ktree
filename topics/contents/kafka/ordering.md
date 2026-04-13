## 순서 보장

**파티션 내에서는 순서 보장, 파티션 간에는 보장 안 됩니다.**

### 파티션 내 순서는 보장

```
Partition 0: [msg1, msg2, msg3] → Consumer A가 순서대로 읽음
Partition 1: [msg4, msg5, msg6] → Consumer B가 순서대로 읽음
```

### 파티션 간 순서는 보장 안 됨

```
Producer 발행 순서: msg1 → msg2 → msg3 → msg4

Partition 0: [msg1, msg3]  → Consumer A
Partition 1: [msg2, msg4]  → Consumer B

실제 처리 순서: msg2가 msg1보다 먼저 처리될 수 있음
```

### 트레이드오프 선택

| 요구사항 | 설계 | 비용 |
|---|---|---|
| 완전 순서 필요 | 파티션 1개 | 처리량 희생 |
| 도메인 내 순서 | Partition Key 사용 | 현실적 타협 |
| 순서 불필요 | 파티션 N개 자유롭게 | 처리량 최대 |

> Kafka 자체가 고처리량을 위해 순서를 일부 포기한 설계입니다. 완전한 순서가 필요하다면 RabbitMQ 같은 단일 큐가 더 적합할 수 있습니다.
