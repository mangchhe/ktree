## Partition Key 전략

완전 순서 보장은 어렵습니다. 파티션 1개면 가능하지만 처리량을 포기해야 합니다.

현실적인 타협은 **Partition Key**를 사용하는 것입니다.

```
userId를 키로 사용
  userId=100 → 항상 Partition 0
  userId=200 → 항상 Partition 1
```

→ 같은 유저의 이벤트는 순서 보장
→ 다른 유저 간 순서는 여전히 보장 안 됨

### 좋은 Partition Key 조건

| 사용 사례 | 추천 Key |
|---|---|
| 같은 주문의 이벤트 순서 보장 | orderId |
| 같은 유저의 이벤트 순서 보장 | userId |
| 순서 불필요, 균등 분산만 | null (라운드로빈) |

### 나쁜 Partition Key 예시

```
카테고리를 키로 사용 (카디널리티 낮음)
  category=FOOD → Partition 0에 80% 집중
  → Hot Partition 발생 → 특정 Consumer만 과부하
```
