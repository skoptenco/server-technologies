const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS,POST,PUT",
    "Access-Control-Allow-Headers": "*",
};

const TEXT_PLAIN_HEADER = {
    "Content-Type": "text/plain; charset=utf-8",
};

const SYSTEM_LOGIN = "32c767f4-f1e7-4931-9825-da8f1f2ba089";

function createApp(express, bodyParser, createReadStream, crypto, http, mongoose, createProxyMiddleware, pug, dotenv) {

    const connectionPool = new Map();
    dotenv.config();

    function getUserModelForConnection(conn) {
        try {
            return conn.model('User');
        } catch (e) {
            const userSchema = new mongoose.Schema({
                login: { type: String, required: true },
                password: { type: String, required: true },
            }, { collection: 'users' });
            return conn.model('User', userSchema);
        }
    }

    function corsMiddleware(req, res, next) {
        res.set(CORS_HEADERS);
        if (req.method === "OPTIONS") return res.sendStatus(204);
        next();
    }

    function readFileAsync(createReadStream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const stream = createReadStream(import.meta.url.substring(8));

            stream.on("data", (chunk) => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            stream.on("error", (err) => reject(err));
        });
    }

    function generateSha1Hash(text) {
        return crypto.createHash("sha1").update(text).digest("hex");
    }

    function readHttpResponse(response) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            response.on("error", (err) => reject(err));
        });
    }

    async function fetchUrlData(url) {
        return new Promise((resolve, reject) => {
            http.get(url, async (response) => {
                try {
                    const data = await readHttpResponse(response);
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            }).on("error", reject);
        });
    }

    const app = express();

    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.use(corsMiddleware);

    app.use('/wordpress', createProxyMiddleware({
        target: process.env.WORDPRESS_HOST,
        changeOrigin: true,
        pathRewrite: (path, req) => {
            return path.replace(/^\/wordpress/, '');
        },
    }));

    app.get("/login/", (_req, res) => {
        res.set(TEXT_PLAIN_HEADER).send(SYSTEM_LOGIN);
    });

    app.get("/code/", async (_req, res) => {
        const fileContent = await readFileAsync(createReadStream);
        res.set(TEXT_PLAIN_HEADER).send(fileContent);
    });

    app.get("/sha1/:input/", (req, res) => {
        const hash = generateSha1Hash(req.params.input);
        res.set(TEXT_PLAIN_HEADER).send(hash);
    });

    app.get("/req/", async (req, res) => {
        try {
            const data = await fetchUrlData(req.query.addr);
            res.set(TEXT_PLAIN_HEADER).send(data);
        } catch (err) {
            res.status(500).send(err.toString());
        }
    });

    app.post("/req/", async (req, res) => {
        try {
            const data = await fetchUrlData(req.body.addr);
            res.set(TEXT_PLAIN_HEADER).send(data);
        } catch (err) {
            res.status(500).send(err.toString());
        }
    });

    app.post('/insert/', async (req, res) => {
        const { login, password, URL } = req.body;

        if (!login || !password || !URL) {
            return res.status(400).json({ error: 'Required fields: login, password, URL' });
        }

        try {
            let conn = connectionPool.get(URL);
            if (!conn) {
                conn = await mongoose.createConnection(URL, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                });

                conn.on('error', (err) => {
                    console.error(`Mongoose connection error for ${URL}:`, err);
                });

                connectionPool.set(URL, conn);
            }

            const User = getUserModelForConnection(conn);

            const doc = new User({ login, password });
            await doc.save();

            return res.status(201).json({ ok: true, insertedId: doc._id });
        } catch (err) {
            console.error('Error in /insert/:', err);


            return res.status(500).json({ error: 'Failed to insert document', details: err.message });
        }
    })

    app.post('/render/', async (req, res) => {
        const addr = req.query.addr;
        if (!addr) return res.status(400).send('Missing query parameter: addr');

        // Validate addr — only http/https allowed
        if (!/^https?:\/\//i.test(addr)) {
            return res.status(400).send('addr must be an http(s) URL');
        }

        // Extract body which may be:
        // - a string that contains JSON serialization of the object
        // - an object (already parsed)
        // - a string that is already the Pug source (not expected, but we tolerate)
        let payload = req.body;

        // If body is an object with keys random2/random3 — accept directly
        let random2, random3;
        try {
            if (typeof payload === 'string') {
                // payload is a string. It might itself be a JSON-string of the object.
                // Try to parse it as JSON. If parsing fails, treat as error.
                const parsed = JSON.parse(payload);
                if (typeof parsed === 'object' && parsed !== null) {
                    random2 = parsed.random2;
                    random3 = parsed.random3;
                } else {
                    return res.status(400).send('Body string parsed, but is not an object');
                }
            } else if (typeof payload === 'object' && payload !== null) {
                // Could be already the object or could be a string field inside object
                // Some clients send { "data": "{\"random2\":...,\"random3\":...}" }
                if ('random2' in payload || 'random3' in payload) {
                    random2 = payload.random2;
                    random3 = payload.random3;
                } else if (typeof payload === 'object' && Object.keys(payload).length === 1) {
                    // try to find first string property and parse it
                    const val = Object.values(payload)[0];
                    if (typeof val === 'string') {
                        const parsed = JSON.parse(val);
                        random2 = parsed.random2;
                        random3 = parsed.random3;
                    } else {
                        return res.status(400).send('Unexpected JSON body format');
                    }
                } else {
                    return res.status(400).send('Body must contain random2 and random3');
                }
            } else {
                return res.status(400).send('Unsupported body format');
            }
        } catch (err) {
            return res.status(400).send('Failed to parse body JSON: ' + err.message);
        }

        // Basic validation
        if (typeof random2 === 'undefined' || typeof random3 === 'undefined') {
            return res.status(400).send('Body must contain random2 and random3');
        }

        let templateText;
        try {
            const resp = await fetch(addr, { timeout: 5000 }); // 5s timeout
            if (!resp.ok) {
                return res.status(502).send(`Failed to fetch template: ${resp.status} ${resp.statusText}`);
            }
            templateText = await resp.text();
        } catch (err) {
            return res.status(502).send('Error fetching template: ' + err.message);
        }

        try {
            const compileFn = pug.compile(templateText, { filename: addr, pretty: true });
            const html = compileFn({ random2, random3 });

            res.set('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch (err) {
            console.error('Pug render error:', err);
            return res.status(500).send('Template render error: ' + err.message);
        }
    });

    app.all(/.*/, (_req, res) => {
        res.set(TEXT_PLAIN_HEADER).send(SYSTEM_LOGIN);
    });

    return app;
}

export default createApp