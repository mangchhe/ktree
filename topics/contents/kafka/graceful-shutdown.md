## Graceful Shutdown

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

### 정상 종료 시 흐름

```
Shutdown Signal
    ↓
새 메시지 수신 중단
    ↓
진행 중인 처리 완료 대기 (최대 30초)
    ↓
acknowledgment.acknowledge() 호출 → offset 커밋
    ↓
Consumer 종료 & 리밸런싱
```

### 누락이 생기는 경우

| 상황 | 결과 |
|---|---|
| 30초 내 처리 완료 | ACK 커밋 → 재시작 후 다음 메시지부터 정상 처리 |
| 30초 초과 (처리 지연) | 강제 종료 → ACK 미커밋 → **같은 메시지 재처리** |
| SIGKILL (강제 kill) | Graceful 무시 → ACK 미커밋 → **같은 메시지 재처리** |

재처리는 되지만 **중복 처리 가능성**이 있습니다. 처리 로직이 **멱등성(idempotent)**을 보장하는지가 핵심입니다.
