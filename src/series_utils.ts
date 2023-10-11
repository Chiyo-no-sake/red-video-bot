import fs from 'fs';

export async function getAvailableSeries(seriesDir: string) {
  return fs.readdirSync(seriesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
}

export async function newSeries(seriesDir: string, seriesName: string) {
  fs.mkdirSync(seriesDir + '/' + seriesName);
}