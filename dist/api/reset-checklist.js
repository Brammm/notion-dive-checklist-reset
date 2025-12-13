// Ensure .env.local/.env are loaded in local development. On Vercel, real env vars are provided by the platform.
import dotenv from 'dotenv';
if (process.env['NODE_ENV'] !== 'production') {
    // Prefer .env.local when present, then fall back to .env
    dotenv.config({ path: '.env.local' });
    dotenv.config();
}
export default async function handler(req, res) {
    try {
        const API_KEY = process.env['NOTION_API_KEY'];
        if (!API_KEY) {
            return res.status(500).json({ error: 'NOTION_API_KEY is not set' });
        }
        // const notion = new Client({ auth: API_KEY });
        // Your Notion API logic here
        return res.status(200).json({ success: true, message: 'Checklist reset' });
    }
    catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Failed to reset checklist' });
    }
}
//# sourceMappingURL=reset-checklist.js.map