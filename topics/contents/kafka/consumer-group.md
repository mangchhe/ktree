## Consumer Group

메시지를 읽는 소비자 묶음입니다. 핵심은 **그룹마다 offset을 독립 추적**한다는 것입니다.

### 그룹 간 독립성

```
sirius-iam-realms-tap-service-user 토픽
  ├── tap-service-api-group (프로덕션) → offset 419 추적
  └── kcat-랜덤그룹 (내가 지금 읽는 것) → offset 독립 추적
```

프로덕션은 자기 그룹 offset만 보기 때문에 kcat이 같은 토픽을 읽어도 프로덕션 offset에 **전혀 영향 없습니다**.

### 그룹 내 파티션 분배

```
tap-service-api-group (서버 3대 띄운 경우)
  ├── 서버 A → Partition 0 담당
  ├── 서버 B → Partition 1 담당
  └── 서버 C → Partition 2 담당
```

**같은 그룹 내에서는** 파티션 1개가 Consumer 1개만 담당합니다. Kafka가 기술적으로 강제합니다.

**다른 그룹 간에는** 파티션을 공유하지 않고 각자 전체를 독립적으로 읽습니다.

### Consumer Group은 구독하는 게 아니라 소속됩니다

- 구독 대상 → **토픽**
- 소속 → **Consumer Group**

같은 토픽을 여러 서비스가 각자의 Group으로 구독하면, 각자 모든 메시지를 받습니다.
