const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const config = require("./config");
const { PORT } = config;
const { qrRoute, pairRoute } = require("./routes");
const { init, isConfigured, getSession, updateSessionData } = require("./store/sessionStore");
const app = express();
app.set("json spaces", 2);

require("events").EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json({ limit: '30mb' })); // absorb fat legacy pushes; nothing here uses them
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Pages are static files with __BOT_REPO__ placeholders, injected at request
// time so the "Source" link always follows the BOT_REPO env var (cached per value).
const pageCache = new Map();
function sendPage(name) {
    return (req, res) => {
        try {
            const repo = config.BOT_REPO;
            const key = name + "|" + repo;
            if (!pageCache.has(key)) {
                pageCache.set(key, require("fs")
                    .readFileSync(path.join(__dirname, "public", name), "utf8")
                    .split("__BOT_REPO__").join(repo));
            }
            res.type("html").send(pageCache.get(key));
        } catch (err) {
            res.status(500).send("Error serving page: " + err.message);
        }
    };
}

app.get("/pair", sendPage("pair.html"));
app.get("/", sendPage("index.html"));
app.get("/qr", sendPage("qr.html"));
app.use("/qr", qrRoute);
app.use("/code", pairRoute);
app.use("/intake", require("./routes/intake"));

app.get("/session/:id", async (req, res) => {
    if (!isConfigured()) {
        return res.status(503).send("No database configured on this server.");
    }
    try {
        const session = await getSession(req.params.id);
        if (!session) {
            return res.status(404).send("Session not found.");
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(session);
    } catch (e) {
        res.status(500).send("Error retrieving session.");
    }
});

app.get("/health", (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: "June X Sessions",
        storage: isConfigured() ? "database" : "inline-zlib",
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, () => {
    console.log(
        `\nDeployment Successful!\n\n June X Session Server running on http://localhost:${PORT}`,
    );
    init(config);
});

module.exports = app;
