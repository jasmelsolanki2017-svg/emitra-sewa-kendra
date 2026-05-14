const express = require("express");
const axios = require("axios");

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_URL = process.env.FIREBASE_URL;

app.use(express.json());

app.post("/", async (req, res) => {

try {

const message = req.body.message;

if (!message) {
return res.send("No message");
}

const text = message.text;

const jobData = {
title: text,
applyLink: "#",
type: "Online Form",
startDate: new Date().toLocaleDateString(),
lastDate: "Update Soon",
qualification: "Update Soon",
location: "All India"
};

await axios.post(
`${FIREBASE_URL}/LatestJobs.json`,
jobData
);

res.send("Job Added");

} catch (err) {
console.log(err);
res.send("Error");
}

});

app.listen(3000, () => {
console.log("Bot Running");
});