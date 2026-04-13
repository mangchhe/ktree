## Dead Letter Topic (DLT)

처리 실패한 메시지를 별도 토픽(DLT)에 보내서 나중에 재처리하는 패턴입니다.

```
일반 처리 흐름:
  Topic → Consumer → 처리 성공 → ACK

DLT 패턴:
  Topic → Consumer → 처리 실패 → DLT 토픽 → 추후 재처리
```

### DLT 미구현 시

예외가 나도 `acknowledge()`로 넘겨버리면 처리 실패한 메시지가 그냥 사라집니다.

### Spring에서 DLT 구현

```java
@RetryableTopic(
    attempts = "3",
    backoff = @Backoff(delay = 1000)
)
@KafkaListener(topics = "my-topic")
public void consume(String message) {
    // 3번 실패하면 my-topic.DLT로 자동 전송
}
```

> 현재 코드가 DLT 없이 단순 acknowledge만 한다면, 처리 실패 메시지 추적이 불가능합니다.
