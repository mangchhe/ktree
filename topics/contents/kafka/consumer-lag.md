## Consumer Lag

```
Lag = 프로듀서가 쓴 최신 offset - 컨슈머 그룹이 읽은 offset
```

쉽게 말하면 **"아직 못 읽은 메시지 수"**입니다.

```
Partition 0
  ├── 최신 offset (Log End Offset) : 500
  └── tap-service-api-group offset : 419
                                     ↑
                                Lag = 81
```

### Lag이 중요한 이유

| 상태 | 의미 |
|---|---|
| Lag ≈ 0 | 정상. 실시간 처리 중. |
| Lag 계속 증가 | 경고. 처리 병목 또는 컨슈머 다운. |

Lag이 계속 커지면 컨슈머가 처리 속도를 못 따라가고 있다는 신호입니다.
