const buildCatalog = require("./index");

async function runTest() {
    const config = {
        start_year: 1960,
        end_year: 2025,
        pages: 50,
        language: "en-US",
        sort_order: "popularity.desc",
        genres: ["comedy"],
        min_critic_score: 0
    };

    console.log("Running builder with test config...");

    try {
        const results = await buildCatalog(config);

        console.log("Builder returned:", results.length, "items");

        // Show first 1 or 2 entries for inspection
        console.log("Sample:", results.splice(0,2));
    } catch (err) {
        console.error("ERROR:", err);
    }
}

runTest();
