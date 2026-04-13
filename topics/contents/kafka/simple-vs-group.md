## Simple Consumer vs Group Consumer

아닙니다. kcat -C가 그 예입니다.

| | kcat -C (Simple) | kcat -G (Group) |
|---|---|---|
| 브로커에 그룹 등록 | X | O |
| offset 저장 | X | O |
| groups 조회 | 안 나옴 | 나옴 |
| 용도 | 모니터링/디버깅 | 실제 서비스 Consumer |

### -C 모드가 안전한 이유

`kcat -C`는 Consumer Group 프로토콜을 사용하지 않습니다.

- Group Coordinator가 이 Consumer를 모름
- `kafka-consumer-groups --list`에도 안 나옴
- 오프셋 저장 안 됨 → 다시 실행하면 처음부터
- 다른 Consumer와 파티션 분배 불가

결론적으로 `temp`라서가 아니라 애초에 브로커에 그룹이 등록 자체가 안 됩니다.

### 실무에서는

- 서비스 코드(Spring 등): 거의 항상 Consumer Group 사용
- kcat -C: "지금 이 토픽에 어떤 메시지가 있는지 확인"하는 용도
