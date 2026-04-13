## Broker

Broker는 Kafka 서버입니다. 메시지를 저장하고 Producer/Consumer 사이에서 중계합니다.

실제로는 여러 대가 **클러스터**를 이루고 있습니다.

```
Producer → [Broker] → Consumer
```

각 Broker는 파티션의 **Leader** 또는 **Follower** 역할을 합니다. Leader가 읽기/쓰기를 처리하고, Follower는 복제본을 유지합니다.
