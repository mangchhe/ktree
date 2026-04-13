## kcat -o 옵션

| 옵션 | 의미 |
|---|---|
| `end` | 지금 이후 새 메시지만 (기본값) |
| `beginning` | 토픽 처음부터 전체 |
| `-1` | end와 동일 |
| `-2` | beginning과 동일 |
| `숫자` | 특정 offset부터 (예: `-o 100`) |
| `-숫자` | 끝에서 N개 (예: `-o -10` → 최신 10개) |

```bash
# 처음부터 전체 읽기
kcat -C -b broker:9092 -t my-topic -o beginning

# 최신 10개만
kcat -C -b broker:9092 -t my-topic -o -10

# offset 100부터
kcat -C -b broker:9092 -t my-topic -o 100
```
