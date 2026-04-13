## Rebalancing

Consumer Group에 인스턴스가 추가/제거되면 파티션을 **자동으로 재배분**합니다.

```
평소: Consumer A, B, C 각각 파티션 담당
Consumer B 죽음
  → Rebalance 발생
  → A, C가 B의 파티션을 나눠 가짐 (자동 복구)
```

재배분이 진행되는 동안 메시지 처리가 잠깐 멈춥니다.

### 배포 시 주의

배포 시 rolling restart를 하면 rebalancing이 반복 발생합니다. Graceful Shutdown과 조합해서 영향을 최소화해야 합니다.
