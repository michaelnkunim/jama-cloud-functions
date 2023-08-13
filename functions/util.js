

const timeAgo = (timestamp) => {
  const seconds = Math.floor((new Date().getTime() - timestamp) / 1000);
  let interval = seconds >= 1 ?
    {short: "s", long: "seconds"}: {"short": "", "long": ""};

  const minutes = Math.floor(seconds / 60);
  if (minutes >= 1) {
    interval = {short: "min", long: "minute"};
  }

  const hour = Math.floor(seconds / 3600);
  if (hour >= 1) {
    interval = {short: "hr", long: "hour"};
  }

  const day = Math.floor(seconds / 86400);
  if (day >= 1) {
    interval = {short: "d", long: "day"};
  }

  const week = Math.floor(seconds / 604800);
  if (week >= 1) {
    interval = {short: "wk", long: "week"};
  }

  const month = Math.floor(seconds / 2592000);
  if (month >= 1) {
    interval = {short: "m", long: "month"};
  }

  const year = Math.floor(seconds / 31536000);
  if (year >= 1) {
    interval = {short: "yr", long: "year"};
  }

  const data = {year, month, week, day, hour, minutes, seconds, interval};
  return data;
};

module.exports = {timeAgo};
