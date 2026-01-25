import fs from "fs";

const data = {
  time: new Date().toISOString(),
  message: "cron works - updated version",
  movies: [
    {
      id: 1,
      title: "فيلم تجريبي 1",
      url: "https://example.com/movie1",
      fetchedAt: new Date().toISOString()
    },
    {
      id: 2,
      title: "فيلم تجريبي 2",
      url: "https://example.com/movie2",
      fetchedAt: new Date().toISOString()
    }
  ]
};

fs.writeFileSync("result.json", JSON.stringify(data, null, 2));
console.log("File created successfully!");
