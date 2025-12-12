// stremio/catalog-builder/lib/cli.js
const readline = require("readline");

function createCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function askRaw(prompt) {
    return new Promise((resolve) => {
      rl.question(`${prompt}: `, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async function askInt(prompt, { min, max }) {
    while (true) {
      const input = await askRaw(`${prompt} (${min}-${max})`);
      if (/^\d+$/.test(input)) {
        const value = parseInt(input, 10);
        if (value >= min && value <= max) {
          return value;
        }
      }
      console.log(`Invalid input. Must be a number between ${min} and ${max}.`);
    }
  }

  async function askFloatRange(prompt, { min, max }) {
    while (true) {
      const input = await askRaw(`${prompt} (${min}-${max})`);
      if (/^\d+(\.\d+)?$/.test(input)) {
        const value = parseFloat(input);
        if (value >= min && value <= max) {
          return value;
        }
      }
      console.log(`Invalid number. Must be between ${min} and ${max}.`);
    }
  }

  async function askChoice(prompt, choices) {
    while (true) {
      console.log(`${prompt}:`);
      choices.forEach((c) => console.log(`  - ${c}`));
      const input = await askRaw("Choose");
      if (choices.includes(input)) {
        return input;
      }
      console.log("Invalid choice.");
    }
  }

  async function askGenres(validGenres) {
    const lowerSet = new Set(validGenres.map((g) => g.toLowerCase()));
    while (true) {
      console.log(`Allowed genres: ${validGenres.join(", ")}`);
      const input = await askRaw("Enter genres (comma-separated)");
      const list = input
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.toLowerCase());

      if (list.length === 0) {
        console.log("You must enter at least one genre.");
        continue;
      }

      const allValid = list.every((g) => lowerSet.has(g));
      if (allValid) {
        return list;
      }
      console.log("Invalid genre in list.");
    }
  }

  async function askCatalogName() {
    while (true) {
      const name = (await askRaw("Catalog name (no spaces)")).trim();
      if (/^[A-Za-z0-9_\-]+$/.test(name)) {
        return name;
      }
      console.log("Catalog name must contain only letters, numbers, underscores, or dashes.");
    }
  }

  function close() {
    rl.close();
  }

  return {
    askInt,
    askFloatRange,
    askChoice,
    askGenres,
    askCatalogName,
    close
  };
}

module.exports = {
  createCli
};
