#!/usr/bin/env node

const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

serveHTTP(addonInterface, {
    port: process.env.PORT || 53476,
    hostname: "0.0.0.0"
});

console.log("Addon running on http://0.0.0.0:" + (process.env.PORT || 53476));

