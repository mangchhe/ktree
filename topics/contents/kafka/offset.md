## Offset

파티션 안에서 메시지의 위치 번호입니다. **파티션마다 독립적**으로 관리됩니다.

```
Partition 0: [0, 1, 2, 3, 4, ... 419]
Partition 1: [0, 1, 2, ... 388]
Partition 2: [0, 1, ... 239]
```

각 파티션은 **append-only 로그**이고, 메시지마다 순차적으로 offset이 부여됩니다.

### Consumer Group별 offset 독립 추적

```
Partition 0 기준
  tap-service-api-group → offset 419 (여기까지 읽음)
  kcat-랜덤그룹         → offset 50  (여기까지 읽음)
  또다른그룹            → offset 0   (아직 안 읽음)
```

Kafka는 각 그룹이 어디까지 읽었는지를 내부 토픽 `__consumer_offsets`에 저장합니다.
