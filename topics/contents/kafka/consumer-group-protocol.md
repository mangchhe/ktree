## Consumer Group 프로토콜

여러 Consumer가 협력해서 파티션을 나눠 읽는 방식입니다.

```
Consumer Group: my-group
  ├── Consumer A → Partition 0 담당
  ├── Consumer B → Partition 1 담당
  └── Consumer C → Partition 2 담당
```

### Join Group 과정

브로커 안의 **Group Coordinator** 컴포넌트와 통신합니다.

```
Consumer → "나 my-group에 합류할게요" → Group Coordinator
           ← "넌 Partition 0 담당해"  ←
```

이 과정 이후 브로커는 해당 그룹이 어디까지 읽었는지(offset)를 기록합니다.

```
__consumer_offsets (내부 토픽)
  my-group / user-events / Partition 0 → offset 1042 (여기까지 읽음)
```

### 반대입니다. 토픽을 구독하고, Consumer Group에 소속됩니다

- 구독 대상 → **토픽**
- 소속 → **Consumer Group**

```
서비스 A (Consumer Group: order-service-group)
  → Topic: payment-events 구독
  → Topic: user-events 구독

서비스 B (Consumer Group: notification-service-group)
  → Topic: payment-events 구독 (서비스 A와 동시에, 독립적으로)
```

Consumer Group은 "이 서비스가 어디까지 읽었는지"를 추적하는 식별자에 가깝습니다.
