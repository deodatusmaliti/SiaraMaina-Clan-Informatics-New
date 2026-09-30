import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    // 1. Only allow POST requests (form submissions)
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const { name, content } = req.body;

        // 2. Validate that data actually arrived
        if (!name || !content) {
            return res.status(400).json({ success: false, error: 'Name and Content are required.' });
        }

        // 3. Directly insert data using Vercel's built-in 'sql' runner
        await sql`
            INSERT INTO entries (name, content) 
            VALUES (${name}, ${content});
        `;

        // 4. Return success back to your frontend box
        return res.status(200).json({ success: true, message: 'Data saved successfully!' });

    } catch (error) {
        // Captures any physical SQL crashes or connection typos
        return res.status(500).json({ success: false, error: error.message });
    }
}
