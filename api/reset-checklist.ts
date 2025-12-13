import dotenv from 'dotenv';
import { type BlockObjectResponse, Client } from '@notionhq/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import checklist from '../checklist.json' with { type: 'json' };

if (process.env['NODE_ENV'] !== 'production') {
    dotenv.config({path: '.env.local'});
    dotenv.config();
}

const API_KEY = process.env['NOTION_API_KEY'];
const PAGE_ID = process.env['NOTION_PAGE_ID'];
const AUTH_HEADER = process.env['AUTH_HEADER'];
if (!API_KEY) {
    throw new Error('Notion API key not found');
}

const notion = new Client({auth: API_KEY});

type Config = {
    Bram: boolean;
    BramDroog: boolean;
    BramNat: boolean;
    Cher: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Simple shared-secret auth: compare request header with env value.
    const providedAuth = req.headers['authorization'] || req.headers['Authorization'] as any;
    if (!AUTH_HEADER || !providedAuth || providedAuth !== AUTH_HEADER) {
        return res.status(200).json({ success: false, message: 'Unauthorized' });
    }
    if (!PAGE_ID) {
        return res.status(500).json({error: 'Page ID not found'});
    }

    try {
        const blocks = await listAllChildren(PAGE_ID);
        const config = await getChecklistConfiguration(blocks[1]!.id);

        const checklist = blocks[3];
        if (checklist) {
            await notion.blocks.delete({block_id: checklist.id});
        }
        
        await createChecklist(PAGE_ID, config);

        return res.status(200).json({success: true, message: 'Checklist reset'});
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({error: 'Failed to reset checklist'});
    }
}

async function getChecklistConfiguration(blockId: string): Promise<Config> {
    const config: Config = {
        Bram: false,
        BramDroog: false,
        BramNat: false,
        Cher: false,
    };

    const blocks = await listTodoChildren(blockId);

    const childrenPromises = blocks.map(async (block) => {
        const text = block.to_do.rich_text.map(rt => rt.plain_text).join('');

        if (text in config) {
            config[text as keyof Config] = block.to_do.checked;
        }

        if (block.to_do.checked && block.has_children) {
            const children = await listTodoChildren(block.id);
            return { text, children };
        }
        return null;
    });

    const results = await Promise.all(childrenPromises);

    for (const result of results) {
        if (!result) continue;

        for (const child of result.children) {
            const childText = child.to_do.rich_text.map(rt => rt.plain_text).join('');
            const combinedKey = result.text + childText;

            if (combinedKey in config) {
                config[combinedKey as keyof Config] = child.to_do.checked;
            }
        }
    }

    return config;
}

async function listAllChildren(blockId: string, pageSize: number = 4): Promise<BlockObjectResponse[]> {
    const page = await notion.blocks.children.list({
        block_id: blockId,
        page_size: pageSize,
    });
    
    return page.results as BlockObjectResponse[];
}

async function listTodoChildren(blockId: string, pageSize: number = 4) {
    const blocks = await listAllChildren(blockId, pageSize);
    return blocks.filter((b): b is Extract<BlockObjectResponse, { type: 'to_do' }> =>
        b.type === 'to_do'
    );
}

async function createChecklist(pageId: string, config: Config) {
    const filteredGroups: Array<{ group: string; items: string[] }> = [];

    for (const [group, list] of Object.entries(checklist)) {
        const items = Object.entries(list)
            .filter(([_, value]) => {
                if (value === true) return true;
                if (typeof value === 'string' && value in config) {
                    return config[value as keyof Config];
                }
                return false;
            })
            .map(([item, _]) => item);

        if (items.length > 0) {
            filteredGroups.push({ group, items });
        }
    }

    const allBlocks = filteredGroups.flatMap(({ group, items }) => [
        {
            object: 'block' as const,
            type: 'heading_3' as const,
            heading_3: {
                rich_text: [{ type: 'text' as const, text: { content: group } }],
            },
        },
        ...items.map(item => ({
            object: 'block' as const,
            type: 'to_do' as const,
            to_do: {
                rich_text: [{ type: 'text' as const, text: { content: item } }],
                checked: false,
            },
        })),
    ]);

    // Create toggle with all the content
    await notion.blocks.children.append({
        block_id: pageId,
        children: [
            {
                object: 'block',
                type: 'quote',
                quote: {
                    rich_text: [{ type: 'text', text: { content: 'Duiklijst' } }],
                    children: allBlocks,
                },
            },
        ],
    });
}
