// Ensure .env.local/.env are loaded in local development. On Vercel, real env vars are provided by the platform.
import dotenv from 'dotenv';
if (process.env['NODE_ENV'] !== 'production') {
    // Prefer .env.local when present, then fall back to .env
    dotenv.config({ path: '.env.local' });
    dotenv.config();
}
import { Client } from '@notionhq/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env['NOTION_API_KEY'];
const PAGE_ID = process.env['NOTION_PAGE_ID'];
if (!API_KEY) {
    throw new Error('Notion API key not found');
}

const notion = new Client({ auth: API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!PAGE_ID) {
        return res.status(500).json({ error: 'Page ID not found' });
    }

    try {
        const config = await getChecklistConfiguration();

        console.log(config);

        return res.status(200).json({ success: true, message: 'Checklist reset' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Failed to reset checklist' });
    }
}

type Config = {
    Bram: boolean;
    BramDroog: boolean;
    BramNat: boolean;
    Cher: boolean;
}

async function getChecklistConfiguration(): Promise<Config> {
    const config: Config = {
        Bram: false,
        BramDroog: false,
        BramNat: false,
        Cher: false,
    }

    function isConfigKey(text: string): text is keyof Config {
        return text in config;
    }
    
    if (!PAGE_ID) {
        throw new Error('Notion page ID not set');
    }
    
    const blocks = await notion.blocks.children.list({block_id: PAGE_ID, page_size: 3})

    for (const block of blocks.results) {
        if (!('type' in block)) continue;

        let parent: string|undefined;
        if (block.type === 'to_do' && block.to_do.rich_text && block.to_do.rich_text.length > 0) {
            parent = block.to_do.rich_text.map(rt => rt.plain_text).join('');
            if (isConfigKey(parent)) {
                config[parent] = block.to_do.checked;
            }
        }

        if (parent && block.has_children) {
            const children = await notion.blocks.children.list({block_id: block.id, page_size: 2});
            for (const child of children.results) {
                if (!('type' in child)) continue;
                if (child.type === 'to_do' && child.to_do.rich_text && child.to_do.rich_text.length > 0) {
                    const type = parent + child.to_do.rich_text.map(rt => rt.plain_text).join('');
                    if (isConfigKey(type)) {
                        config[type] = child.to_do.checked;
                    }
                }
            }
        }
    }
    
    return config;
}
