## Topic

메시지가 쌓이는 채널입니다. DB의 테이블과 비슷한 개념이에요.

```
Topic: user-events
  ├── Partition 0: [msg1, msg4, msg7 ...]
  ├── Partition 1: [msg2, msg5, msg8 ...]
  └── Partition 2: [msg3, msg6, msg9 ...]
```

- Producer는 토픽에 메시지를 **씁니다**.
- Consumer는 토픽에서 메시지를 **읽습니다**.
- 같은 토픽을 여러 Consumer Group이 **독립적으로** 구독할 수 있습니다.
