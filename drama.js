import fs from "fs";
import fetch from "node-fetch";

const FILE = "drama.json";

// مثال API (بدله بمصدرك)
const API_URL = "https://api.tvmaze.com/search/shows?q=drama";

async function run() {
  console.log("Fetching drama…");

  const res = await fetch(API_URL);
  const data = await res.json();

  const dramas = data.slice(0, 30).map(item => ({
    title: item.show.name,
    image: item.show.image?.medium || "",
    year: item.show.premiered?.split("-")[0] || "",
    rating: item.show.rating?.average || 0,
    url: item.show.url
  }));

  // 🧹 حذف القديم وكتابة الجديد
  fs.writeFileSync(FILE, JSON.stringify({
    updated: new Date().toISOString(),
    count: dramas.length,
    dramas
  }, null, 2));

  console.log("Drama updated:", dramas.length);
}

run();
