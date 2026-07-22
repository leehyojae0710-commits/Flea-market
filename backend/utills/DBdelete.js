import pool from '../config/db.js';

const ALLOWED_TABLES = {
    markets: 'marketId',
    applications: 'applicationId',
}
export async function dbdelete(tableName,idValue) {
    const idColumn =ALLOWED_TABLES[tableName];

    if(!idColumn)
    {
        throw new Error(`허용되지 않은 테이블입니다: ${tableName}`)
    }

    const sql = `DELETE FROM ${tableName} WHERE ${idColumn} = ?`;
    const [result] = await pool.query(sql,[idValue]);
    return result;
}
