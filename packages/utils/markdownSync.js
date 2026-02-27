import fs from 'fs';
import path from 'path';

/**
 * Universal Markdown Sync Utility
 */
export class MarkdownSync {
    constructor(db, options = {}) {
        this.db = db;
        this.baseDir = options.baseDir || path.join(process.cwd(), 'memory');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    }

    /**
     * Sync a table to a Markdown file
     * @param {string} tableName 
     * @param {string} fileName 
     * @param {string} title 
     */
    syncTableToMd(tableName, fileName, title) {
        try {
            const rows = this.db.prepare(`SELECT * FROM ${tableName}`).all();
            const filePath = path.join(this.baseDir, fileName);

            if (rows.length === 0) return;

            const keys = Object.keys(rows[0]);
            let content = `# ${title}\n\n`;
            content += `> [!NOTE]\n`;
            content += `> This is a human-friendly mirror of the '${tableName}' table. \n`;
            content += `> Manual edits here will be synced back to the database.\n\n`;

            content += `| ${keys.join(' | ')} |\n`;
            content += `| ${keys.map(() => '---').join(' | ')} |\n`;

            for (const row of rows) {
                const values = keys.map(k => {
                    const val = row[k];
                    return (val === null || val === undefined) ? '' : String(val).replace(/\n/g, '<br>');
                });
                content += `| ${values.join(' | ')} |\n`;
            }

            fs.writeFileSync(filePath, content, 'utf8');
        } catch (err) {
            console.error(`[MarkdownSync] Failed to sync ${tableName} to MD:`, err.message);
        }
    }

    /**
     * Sync a Markdown file to a table
     * @param {string} tableName 
     * @param {string} fileName 
     * @param {Array<string>} primaryKeys 
     */
    syncMdToTable(tableName, fileName, primaryKeys) {
        const filePath = path.join(this.baseDir, fileName);
        if (!fs.existsSync(filePath)) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            let headers = null;

            for (const line of lines) {
                const match = line.match(/^\|\s*(.+?)\s*\|/);
                if (match) {
                    const columns = match[1].split('|').map(c => c.trim());
                    if (!headers) {
                        if (columns[0] !== '---') {
                            headers = columns;
                        }
                    } else if (columns[0].startsWith('---')) {
                        continue;
                    } else if (headers && columns.length === headers.length) {
                        this.upsertRow(tableName, headers, columns, primaryKeys);
                    }
                }
            }
        } catch (err) {
            console.error(`[MarkdownSync] Failed to sync MD to ${tableName}:`, err.message);
        }
    }

    /** @private */
    upsertRow(tableName, headers, values, primaryKeys) {
        const columns = headers.join(', ');
        const placeholders = headers.map(() => '?').join(', ');
        const updates = headers.filter(h => !primaryKeys.includes(h)).map(h => `${h} = excluded.${h}`).join(', ');

        const sql = `
            INSERT INTO ${tableName} (${columns})
            VALUES (${placeholders})
            ON CONFLICT(${primaryKeys.join(', ')}) DO UPDATE SET ${updates}
        `;

        try {
            this.db.prepare(sql).run(...values);
        } catch (err) {
            // Silently ignore if conflict logic isn't supported for this table (e.g. no PK)
        }
    }
}
