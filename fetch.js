import fs from "fs";

const data = {
  time: new Date().toISOString(),
  message: "cron works"
};

fs.writeFileSync("result.json", JSON.stringify(data, null, 2));

