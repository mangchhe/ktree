// 독백 프롬프트 재고 (kind·topic 별). run-sql.sh 를 node 로 못 돌릴 때 쓴다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const html = readFileSync('./index.html', 'utf8');
const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
                        { auth:{ persistSession:false } });
await sb.auth.signInWithPassword({ email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
const { data, error } = await sb.from('eng_prompts').select('kind,topic,question_en');
if (error) { console.error(error); process.exit(1); }
const c = {};
for (const r of data) c[r.kind] = (c[r.kind] || 0) + 1;
console.log(c);
for (const r of data) console.log(r.kind, r.topic, r.question_en.slice(0, 80));
