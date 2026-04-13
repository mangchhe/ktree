## Retention (보존 기간)

메시지가 영구 저장되는 게 아니라 설정된 기간 후 삭제됩니다. 기본값은 보통 **7일**입니다.

```
offset이 retention 범위를 벗어나면
auto-offset-reset: latest 발동
→ 그 사이 메시지는 누락
```

### 주의해야 할 상황

- Consumer가 오랫동안 다운되어 있다가 재시작
- 새로운 Consumer Group이 오래된 토픽을 `earliest`로 읽으려 할 때 일부 누락 가능

```yaml
spring:
  kafka:
    consumer:
      auto-offset-reset: earliest  # 처음부터
      # auto-offset-reset: latest  # 이후부터
```
