import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
  Crawler,
  BasicExtractor,
  DiskCache,
  Document,
  getAi,
  getFetcher,
  getExtractor ,
} from 'foxtrot-ai';

let cache = new DiskCache(
  '/tmp/ft-analysis',
  { ttls:
    {
      fetch: 10*24*3600,
      prompt: 10*24*3600,
    }
  });
// cache = null;

const fetcher = getFetcher('fetch', { cache });
const numLinks = 10;

// For each extrator/model pair, we want:
// - Accuracy (right answer is either ground truth, or majority vote)
// - Token usage
// - Speed

const npmCase = {
  url: 'https://www.npmjs.com/search?q=keywords:backend&page=0&ranking=optimal',
  crawl: 'Find links to npm packages, the format must match https://www.npmjs.com/package/[package-name]',
  questions: [
    'What is the GitHub URL of this package?',
    'What is the curent version of this package?',
    'How many weekly downloads does this package have? Format: number',
    'What is the unpacked size of this package, in bytes? Format: number',
    'What is the license?',
  ],
};

const xCase = {
  url: 'https://x.com/elonmusk/status/1833745060812509589',
  crawl: 'Find links to profiles that have replied',
  questions: [
    'What is the username of this profile?',
    'How many followers does this profile have?',
  ],
};

const cnnCase = {
  url: 'https://www.cnn.com',
  crawl: 'Find links to news articles on cnn.com',
  questions: [
    'What is the title of this article?',
    'Who is the author(s) of this article?',
    'What is the date of this article, format: YYYY-MM-DD',
  ]
};

const wikipediaCase = {
  url: 'https://en.wikipedia.org/wiki/List_of_Pok%C3%A9mon',
  crawl: 'Find links to individual Pokemon pages',
  questions: [
    'What is the name of this Pokemon?',
    'What is the Pokedex index number? Format: 4 digit number with leading zeros',
    'What is the type of this Pokemon?',
    'What is the previous evolution of this Pokemon? Format: name only. Reply N/A if none',
    'What is the next evolution of this Pokemon? Format: name only. Reply N/A if none',
  ],
};

const pokedexCase = {
  url: 'https://pokemondb.net/pokedex/all',
  crawl: 'Find links to individual Pokemon pages',
  questions: [
    'Name',
    'Number (include leading zeros)',
    'Type',
    'Species',
    'Height (m)',
    'Weight (kg)',
    'Base HP',
    'Base Attack',
    'Base Defense',
    '% Male, Format: XX.X',
    '% Female, Format: XX.X',
  ],
};

const githubCase = {
  url: 'https://github.com/trending',
  crawl: 'Find links to trending repositories on GitHub',
  questions: [
    'What is the repository name?',
    'Who is the repository owner?',
    'What programming language is primarily used?',
    'How many stars does the repository have? Format: number',
    'How many forks does the repository have? Format: number',
  ],
};

const stackOverflowCase = {
  url: 'https://stackoverflow.com/questions?tab=Newest',
  crawl: 'Find links to questions on StackOverflow. Must have URL format "stackoverflow.com/questions/{number}"',
  questions: [
    'What is the title of the question?',
    'Who is the author of the question?',
    'How many votes does the question have? Format: number',
    'How many answers does the question have? Format: number',
  ],
};

const imdbCase = {
  url: 'https://www.imdb.com/chart/top',
  crawl: 'Find links to individual movie pages on IMDB. Must have "/title/" in the URL.',
  questions: [
    'What is the title of the movie?',
    'What is the release year of the movie?',
    'What is the IMDB rating of the movie? Format: X.X/10',
    'Who is the director of the movie?',
  ],
};

const mediumCase = {
  url: 'https://medium.com/tag/backend',
  crawl: 'Find links to articles tagged "backend" on Medium',
  questions: [
    'What is the title of the article?',
    'Who is the author of the article?',
    'How many claps does the article have? Format: number',
    'What is the publication date? Format: YYYY-MM-DD',
  ],
};

const hackerNewsCase = {
  url: 'https://news.ycombinator.com/',
  crawl: 'Find links to comment pages for each article',
  questions: [
    'What is the title of the article?',
    'What is the URL of the article?',
    'Who submitted this article?',
    'How many points does the article have? Format: number',
    'How many comments does the article have? Format: number',
  ],
};

const gutenbergCase = {
  url: 'https://www.gutenberg.org/ebooks/search/?query=science',
  crawl: 'Find links to science-related books on Project Gutenberg',
  questions: [
    'What is the title of the book?',
    'Who is the author of the book?',
    'What is the release date of the book? Format: YYYY-MM-DD',
  ],
};

const geniusCase = {
  url: 'https://genius.com/hot-songs',
  crawl: 'Find links to song pages. Only links to individual, specific songs.',
  questions: [
    'What is the title of the song?',
    'Who is the artist of the song?',
    'How many views does the song have? Format: number. Expand abbreviations like "K" or "M"',
    'When was the song released? Format: YYYY-MM-DD',
  ],
};

const oldRedditCase = {
  url: 'https://old.reddit.com/r/worldnews/',
  crawl: 'Find links comment pages',
  questions: [
    'What is the title of the linked article?',
    'What is the domain of the linked article?',
    'What is the full text of the top comment?',
    'Who is the author of the top comment? Username only',
  ],
};




const cases = [
  npmCase,
  wikipediaCase,
  pokedexCase,
  stackOverflowCase,
  imdbCase,
  mediumCase,
  hackerNewsCase,
  gutenbergCase,
  geniusCase,
  oldRedditCase,


  // These don't work well with fetch()
  // xCase,
  // cnnCase,
];

const crawlerAi = 'openai:gpt-4o';

const ais = [
  // 'human',

  'openai:gpt-4o-mini',
  'openai:gpt-4o',
  'openai:gpt-3.5-turbo',
  'openai:gpt-4',
  'openai:gpt-4-turbo',

  // 'mistral:mistral-large-latest',

  // 'anthropic:claude-3-5-sonnet-20240620',
  // 'anthropic:claude-3-haiku-20240307',

  // 'ollama:llama3.1:8b',
  // 'ollama:llama3.1:70b',
  // 'ollama:gemma2:27b',
  // 'ollama:mistral-nemo',
  // 'ollama:deepseek-coder-v2',

  'ollama:codellama:13b',
  'ollama:codellama:34b',
  // 'ollama:codellama:70b',
];

const extractors = [
  // 'basic',
  'iterative-prompt',

  // ['basic', getExtractor('basic')],
  // ['iterative-prompt', getExtractor('iterative-prompt')],
];

const voteWeights = {
  'human': 100,

  'openai:gpt-4o/basic': 2,
  'openai:gpt-4o-mini/basic': 2,
  'openai:gpt-4-turbo/basic': 1,

  'openai:gpt-4o/iterative-prompt': 2,
  'openai:gpt-4o-mini/iterative-prompt': 2,
  'openai:gpt-4-turbo/iterative-prompt': 1,
}

const main = async () => {
  const scoreboard = {};
  for (const ai of ais) {
    for (const ex of extractors) {
      const candidate = `${ai}/${ex}`;
      scoreboard[candidate] = {
        total: 0,
        majority: 0,
      };
    }
  }

  const results = {};
  const usage = {};
  const took = {};

  const total = cases.length * ais.length * extractors.length;
  let count = 0;

  for (const cs of cases) {
    for (const ai of ais) {
      if (ai == 'human') {
        results['human'] = getHuman(cs);
        continue;
      }

      for (const ex of extractors) {
        console.log('');
        console.log('');
        console.log(`Evaluating ${cs.url} -> ${ai}/${ex} (${++count}/${total})`);

        const candidate = `${ai}/${ex}`;

        const [r, u, t] = await evaluate(cs, ex, ai);
        results[candidate] = r;
        if (!usage[candidate]) {
          usage[candidate] = u;
        } else {
          usage[candidate].output += u.output;
          usage[candidate].input += u.input;
          usage[candidate].total += u.total;
        }
        if (!took[candidate]) {
          took[candidate] = t;
        } else {
          took[candidate] += t;
        }
      }
    }

    const key = `${ais[0]}/${extractors[0]}`;
    console.log(key);
    const first = results[key];
    const numItems = first.length;

    for (let i = 0; i < numItems; i++) {
      const majority = {};

      for (const question of cs.questions) {
        const votes = {};
        for (const ai of ais) {
          for (const ex of extractors) {
            const candidate = `${ai}/${ex}`;
            const weight = voteWeights[candidate];
            if (!weight) continue;
            const answer = results[candidate][i][question] || '(not found)';
            votes[answer] ||= 0;
            votes[answer] += weight;
          }
        }

        let best = 0;
        for (const answer of Object.keys(votes)) {
          if (votes[answer] > best) {
            majority[question] = answer;
            best = votes[answer];
          }
        }
      }

      console.log('');
      const item = first[i];
      const url = (item.source ? item.source().url : '?');
      console.log('majority answers for', url);
      console.log(JSON.stringify(majority, null, 2));

      const human = {
        url,
        data: majority,
      };
      saveData('majority', ['answer', url, cs.questions.join('; ')], human);

      for (const question of cs.questions) {
        for (const ai of ais) {
          for (const ex of extractors) {
            const candidate = `${ai}/${ex}`;
            const answer = results[candidate][i][question] || '(not found)';
            scoreboard[candidate].total++;
            if (answer == majority[question]) {
              scoreboard[candidate].majority++;
            }
          }
        }
      }
    }
  }

  console.log('\nusage:');
  console.log(JSON.stringify(usage, null, 2));
  console.log('\nscoreboard:');
  console.log(JSON.stringify(scoreboard, null, 2));
  console.log('\ntime (seconds):');
  console.log(JSON.stringify(took, null, 2));
}

const evaluate = async (cs, exStr, aiStr) => {
  const ai = getAi(aiStr, { cache });
  const ex = getExtractor(exStr, { ai, cache});
  const fetcher = getFetcher('fetch', { cache });
  const results = [];

  const start = (new Date()).getTime() / 1000;

  let count = 0;

  const links = await getLinks(cs.url, cs.crawl, numLinks);

  for (const link of links) {
    console.log(`- ${link.url} -> ${aiStr}`);
    // const ex = new BasicExtractor({ ai, fetcher, cache });

    let doc;
    const saved = loadData('docs', ['doc', link.url]);
    if (saved) {
      doc = new Document();
      doc.loadData(saved);
    } else {
      doc = await fetcher.fetch(link.url);
      saveData('docs', ['doc', link.url], doc.dump());
    }

    const item = await ex.one(doc, cs.questions);
    console.log(item?.source().url + ' ->');
    for (const q in item) {
      console.log(`\t- ${'' + item[q].replaceAll('\n', '').substr(0, 80) + (item[q].length > 80 ? '...' : '')}`);
    }

    results.push(item || {});
  }

  const took = (new Date()).getTime() / 1000 - start;
  return [results, ai.usage, took];
}

const getLinks = async (url, prompt, limit, save) => {
  const saved = loadData('links', ['link', url, prompt, limit]);
  if (saved) {
    return saved;
  }

  const crawler = new Crawler(crawlerAi, { fetcher, cache });
  const resp = await crawler.all(url, prompt, { limit });
  const links = resp.map(x => x.link);

  saveData('links', ['link', url, prompt, limit], links);

  return links;
}

const getHuman = (cs) => {
  const links = loadData('links', ['link', cs.url, cs.crawl]);

  const results = [];
  for (const link of links) {
    const result = loadData('human', ['answer', link.url, cs.questions.join('; ')]);

    console.log('result', result);
    results.push(result?.data || {});
  }
  return results;
}

const generateKey = (keyArr) => {
  const slug = keyArr
    .map(x => '' + x)
    .join('-')
    .replaceAll(/[^A-Za-z0-9]+/g, '-');
  const hash = crypto
    .createHash('sha256')
    .update(slug)
    .digest('hex')
    .substr(0, 10);

  const filename = `${slug.substr(0, 30)}-${hash}.json`;
  return filename;
};

const saveData = (subdir, keyArr, data) => {
  const filename = generateKey(keyArr);
  const filepath = path.join('./data', subdir, filename);

  if (!fs.existsSync(path.dirname(filepath))) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
  }

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

const loadData = (subdir, keyArr, data) => {
  const filename = generateKey(keyArr);
  const filepath = path.join('./data', subdir, filename);

  if (fs.existsSync(filepath)) {
    const fileContent = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(fileContent);
  } else {
    return null;
  }
}

main();
