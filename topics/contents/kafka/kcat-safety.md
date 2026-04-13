## 같은 그룹 ID로 접속하면 왜 위험한가

Kafka 메시지는 **읽는다고 사라지지 않습니다**. 읽기 자체는 안전합니다.

```
sirius-iam-realms-tap-service-user 토픽
  ├── tap-service-api-group (프로덕션) → offset 419 추적
  └── kcat-랜덤그룹 (내가 지금 읽는 것) → offset 독립 추적
```

### 위험한 경우

```bash
# 절대 하지 말 것 — 프로덕션 그룹으로 접속
kcat -G tap-service-api-group ...
```

같은 Consumer Group ID로 접속하면:
- 파티션이 프로덕션 Consumer와 분산 배정됨
- 프로덕션이 **일부 메시지를 못 받을 수 있음**

### kcat -C가 안전한 이유

```
프로덕션: tap-service-api-group
kcat:     kcat-abc123xyz (랜덤, 실행마다 다름)
```

`-C` 모드는 아예 브로커에 그룹 등록을 안 합니다. Group Coordinator가 존재 자체를 모릅니다.
