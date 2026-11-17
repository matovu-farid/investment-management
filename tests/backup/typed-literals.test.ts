import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'

test('SQLite literals preserve large integers and NUL-containing text when encoded by type',()=>{
 const db=new DatabaseSync(':memory:')
 db.exec("CREATE TABLE source(id TEXT,value); INSERT INTO source VALUES('i',9223372036854775807),('t',CAST(X'410042' AS TEXT)),('b',X'00FF80'); CREATE TABLE restored(id TEXT,value);")
 const rows=db.prepare("SELECT id,CASE typeof(value) WHEN 'integer' THEN quote(value) WHEN 'text' THEN 'CAST(X' || quote(hex(CAST(value AS BLOB))) || ' AS TEXT)' WHEN 'blob' THEN 'X' || quote(hex(value)) END AS literal FROM source ORDER BY id").all() as {id:string;literal:string}[]
 for(const r of rows){assert.match(r.id,/^[a-z]+$/);db.exec(`INSERT INTO restored VALUES('${r.id}',${r.literal})`)}
 const select=(table:string)=>db.prepare(`SELECT id,typeof(value) AS kind,CASE WHEN typeof(value)='integer' THEN CAST(value AS TEXT) ELSE hex(CAST(value AS BLOB)) END AS encoded FROM ${table} ORDER BY id`).all()
 assert.deepEqual(select('restored'),select('source'));db.close()
})
test('quote does not preserve the sign bit of negative zero, so REAL needs a separate recovery method',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE values_test(value); INSERT INTO values_test VALUES(-0.0)')
 const original=db.prepare('SELECT value,quote(value) AS literal FROM values_test').get() as {value:number;literal:string}
 db.exec(`INSERT INTO values_test VALUES(${original.literal})`)
 const restored=(db.prepare('SELECT value FROM values_test ORDER BY rowid DESC LIMIT 1').get() as {value:number}).value
 assert.ok(Object.is(original.value,-0));assert.ok(Object.is(restored,0));db.close()
})
