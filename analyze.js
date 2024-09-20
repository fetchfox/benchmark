import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';

import {
  Crawler,
  DiskCache,
  Document,
  getAi,
  getFetcher,
  getExtractor,
  getMinimizer,
} from 'foxtrot-ai';

let cache = new DiskCache(
  '/tmp/ft-analysis',
  { ttls:
    {
      fetch: 100*24*3600,
      prompt: 10*24*3600,
      min: 10*24*3600,
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
    'What is the title of the main article?',
    'Who is the author of the main article?',
    'How many claps does the main article have? Format: number',
    'What is the publication date of the main article? Format: YYYY-MM-DD',
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
  crawl: 'Find links to science-related books on Project Gutenberg. The links MUST have the format /ebook/{number}',
  questions: [
    'What is the title of the main book?',
    'Who is the author of the main book?',
    'What is the release date of the main book? Format: YYYY-MM-DD',
  ],
};

const geniusCase = {
  url: 'https://genius.com/hot-songs',
  crawl: 'Find links to song pages. Only links to individual, specific songs.',
  questions: [
    'What is the title of the song?',
    'Who is the artist of the song?',
    'How many views does the song have? Format: number, expand K and M',
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
  hackerNewsCase,
  gutenbergCase,
  geniusCase,
  oldRedditCase,

  // mediumCase,

  // These don't work well with fetch()
  // xCase,
  // cnnCase,
];

const crawlerAi = 'openai:gpt-4o';

const ais = [
  ['human'],

  ['openai:gpt-4o-mini'],
  // ['openai:gpt-4o'],
  // ['openai:gpt-3.5-turbo'],
  // ['openai:gpt-4'],
  // ['openai:gpt-4-turbo'],

  // ['mistral:mistral-large-latest'],

  // ['anthropic:claude-3-5-sonnet-20240620'],
  // ['anthropic:claude-3-haiku-20240307'],

  ['ollama:llama3.1:8b', { maxTokens: 10000 }],
  // ['ollama:llama3.1:70b', { maxTokens: 50000 }],
  // ['ollama:gemma2:27b'],
  // ['ollama:mistral-nemo'],
  // ['ollama:mistral-large'],
  // ['ollama:deepseek-coder-v2'],

  ['ollama:codellama:13b'],
  ['ollama:codellama:34b'],
  // ['ollama:codellama:70b'],

  ['groq:llama3-8b-8192'],
  ['groq:llama3-70b-8192'],
];

const extractors = [
  ['single-prompt'],
  // ['iterative-prompt'],

  // ['min', { extractor: getExtractor('iterative-prompt') }, 'min-ip'],

  // ['min',
  //  { minimizer: getMinimizer('tag-removing', { cache }),
  //    extractorFn: (ai) => getExtractor('single-prompt', { ai, cache }),
  //  },
  //  'tag-removing+single-prompt'],

  // ['min',
  //  { minimizer: getMinimizer('text-only', { cache }),
  //    extractor: getExtractor('single-prompt', { cache }),
  //  },
  //  'text-only+single-prompt'],

  ['min',
   { minimizer: getMinimizer('extractus', { cache }),
     extractor: getExtractor('single-prompt', { cache }),
   },
   'extractus+single-prompt'],


  ['min',
   { minimizer: getMinimizer('tag-removing', { cache }),
     extractorFn: (ai) => getExtractor('iterative-prompt', { ai, cache }),
   },
   'tag-removing+iterative-prompt'],

  ['min',
   { minimizer: getMinimizer('text-only', { cache }),
     extractor: getExtractor('iterative-prompt', { cache }),
   },
   'text-only+iterative-prompt'],

  // ['min',
  //  {
  //    extractor: getExtractor('single', { cache }),
  //    minimizer: getMinimizer('ai', { ai: 'openai', cache }),
  //  },
  //  'min-ai'],
];

const voteWeights = {
  'human': 100,

  'openai:gpt-4o/single-prompt': 2,
  'openai:gpt-4o-mini/single-prompt': 2,
  'openai:gpt-4-turbo/single-prompt': 1,

  'openai:gpt-4o/tag-removing+single-prompt': 1,
  'openai:gpt-4o-mini/tag-removing+single-prompt': 1,

  'openai:gpt-4o/iterative-prompt': 2,
  'openai:gpt-4o-mini/iterative-prompt': 2,
  'openai:gpt-4-turbo/iterative-prompt': 1,
}

const makeKey = (ai, ex) => {
  return ai  == 'human' ? 'human' : `${ai}/${ex}`;
}

const main = async () => {
  const scoreboard = {};
  for (const [ai, aiOptions] of ais) {
    for (const [ex, exOptions, exLabel] of extractors) {
      const candidate = makeKey(ai, exLabel || ex);
      scoreboard[candidate] = {
        total: 0,
        majority: 0,
      };
    }
  }

  const usage = {};
  const cost = {};
  const elapsed = {};

  const total = cases.length * ais.length * extractors.length;
  let count = 0;

  for (const cs of cases) {
    const results = {};

    for (const [ai, aiOptions] of ais) {
      for (const [ex, exOptions, exLabel] of extractors) {
        console.log('');
        console.log('');
        console.log(`Evaluating ${cs.url} -> ${ai}/${ex} (${++count}/${total})`);

        const candidate = makeKey(ai, exLabel || ex);
        resetAgentDataForCase(cs, candidate);

        if (ai == 'human') {
          results.human = await getHuman(cs);
        } else {
          let evalResult;

          try {
            evalResult = await evaluate(cs, ex, exOptions, ai, aiOptions);
          } catch(e) {
            console.log(`ERROR! Skip ${candidate}`);
            // throw e;
            continue;
          }

          updateAgentDataForResult(cs, candidate, evalResult, results.human || []);

          const {
            results: r,
            usage: u,
            cost: c,
            elapsed: e,
            took: t,
          } = evalResult;

          results[candidate] = r;

          for (const [all, incr] of [[usage, u], [cost, c], [elapsed, e]]) {
            if (!all[candidate]) {
              all[candidate] = incr;
            } else {
              for (const k in incr) {
                all[candidate][k] += incr[k];
                all[candidate][k] += incr[k];
                all[candidate][k] += incr[k];
              }
            }
          }
        }
      }
    }

    const key = makeKey(ais[0], extractors[0]);
    const first = results[key];
    const numItems = first.length;

    for (let i = 0; i < numItems; i++) {
      const majority = {};

      for (const question of cs.questions) {
        const votes = {};
        for (const [ai, aiOptions] of ais) {
          for (const [ex, exOptions, exLabel] of extractors) {
            const candidate = makeKey(ai, exLabel || ex);
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
        for (const [ai, aiOptions] of ais) {
          for (const [ex, exOptions, exLabel] of extractors) {
            const candidate = makeKey(ai, exLabel || ex);
            const item = results[candidate] ? results[candidate][i] : {};
            const answer = item[question] || '(not found)';
            scoreboard[candidate].total++;
            const correct = answer == majority[question];
            if (correct) {
              scoreboard[candidate].majority++;
            }
          }
        }
      }
    }
  }

  console.log('\nusage:');
  console.log(JSON.stringify(usage, null, 2));
  console.log('\ncost:');
  console.log(JSON.stringify(cost, null, 2));
  console.log('\ntime (seconds):');
  console.log(JSON.stringify(elapsed, null, 2));
  console.log('\nscoreboard:');
  console.log(JSON.stringify(scoreboard, null, 2));
}

const evaluate = async (cs, exStr, exOptions, aiStr, aiOptions) => {
  const ai = getAi(aiStr, { cache, ...aiOptions });
  if (exOptions?.extractorFn) {
    exOptions = Object.assign({}, exOptions);
    exOptions.extractor = exOptions.extractorFn(ai);
  }
  const ex = getExtractor(exStr, { ai, cache, ...exOptions });
  const fetcher = getFetcher('fetch', { cache });

  const start = (new Date()).getTime() / 1000;
  let count = 0;
  const links = await getLinks(cs.url, cs.crawl, numLinks);

  const results = [];
  const docs = [];
  const stats = [];

  for (const link of links) {
    const innerStart = (new Date()).getTime() / 1000;
    let doc;
    const saved = loadData('docs', ['doc', link.url]);
    if (saved) {
      doc = new Document();
      doc.loadData(saved);
    } else {
      doc = await fetcher.fetch(link.url);
      saveData('docs', ['doc', link.url], doc.dump());
    }

    const before = {
      usage: Object.assign({}, ex.ai.usage),
      cost: Object.assign({}, ex.ai.cost),
      elapsed: Object.assign({}, ex.ai.elapsed),
    };
    const item = await ex.one(doc, cs.questions);
    const after = {
      usage: Object.assign({}, ex.ai.usage),
      cost: Object.assign({}, ex.ai.cost),
      elapsed: Object.assign({}, ex.ai.elapsed),
    };

    const delta = (d0, d1) => {
      const d = {};
      for (const k in d0) {
        d[k] = d1[k] - d0[k];
      }
      return d;
    }

    stats.push({
      usage: delta(before.usage, after.usage),
      cost: delta(before.cost, after.cost),
      elapsed: delta(before.elapsed, after.elapsed),
    });

    results.push(item || {});
    docs.push(doc);

    const innerTook = '(' + Number((new Date()).getTime() / 1000 - innerStart).toFixed(2) + ' sec)';
    console.log(`- ${link.url} -> ai:${aiStr}/ex:${exStr} ${innerTook}`);
  }

  const took = (new Date()).getTime() / 1000 - start;

  const cleanTag = (s) => s.replaceAll('[', '').replaceAll(']', '');

  const tags = {
    ai: { provider: aiStr.split(':')[0], model: ai.model },
    extractor: cleanTag('' + ex),
  };

  if ('' + ex == '[MinimizingExtractor]') {
    tags.extractor = cleanTag('' + ex.extractor);
    tags.minimizer = cleanTag('' + ex.minimizer);
  }

  const sum = (field) => stats.reduce((acc, x) => {
    for (const k in x[field]) {
      acc[k] ||= 0;
      acc[k] += x[field][k];
    }
    return acc;
  }, {});

  return {
    results,
    stats,
    docs,
    usage: sum('usage'),
    cost: sum('cost'),
    elapsed: sum('elapsed'),
    took,
    tags,
  };
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

const getHuman = async (cs) => {
  const links = await getLinks(cs.url, cs.crawl, numLinks);

  const results = [];
  for (const link of links) {
    const saved = loadData('docs', ['doc', link.url]);
    const result = loadData('human', ['answer', saved.url, cs.questions.join('; ')]);
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

const resetAgentDataForCase = async (cs, agentId) => {
  const filename = agentId.replace(/\.|\//g, '-') + '.json';
  const filepath = path.join('./out/agents/', filename);
  const ps = [
    './out/agents',
    './out/docs',
  ];
  for (const p of ps) {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }

  // Get existing or initialize the data
  let out;
  if (fs.existsSync(filepath)) {
    out = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } else {
    out = { urls: [], scoreboard: {}, stats: {} };
  }

  const existing = out.scoreboard[cs.url];
  if (existing && existing.length > numLinks) {
    console.log('NOT resetting as we have more results saved. Remove file to override');
    return;
  }

  // Remove this case's data, if it exists
  out.urls = out.urls.filter(u => u != cs.url);
  delete out.scoreboard[cs.url];

  fs.writeFileSync(filepath, JSON.stringify(out, null, 2), 'utf8');
}

const updateAgentDataForResult = async (cs, agentId, result, expected) => {
  if (!expected && expected.length) return;

  const filename = agentId.replace(/\.|\//g, '-') + '.json';
  const filepath = path.join('./out/agents/', filename);
  const out = JSON.parse(fs.readFileSync(filepath, 'utf8'));

  out.id = agentId;
  out.tags = result.tags || {};

  const existing = out.scoreboard[cs.url];
  if (existing && existing.length > numLinks) {
    console.log('NOT saving as we have more results saved. Remove file to override');
    return;
  }

  if (out.urls.includes(cs.url)) {
    throw 'clear first';
  }

  const actual = result.results;
  out.urls.push(cs.url);
  out.scoreboard[cs.url] = [];
  out.stats[cs.url] = {
    usage: result.usage,
    cost: result.cost,
    elapsed: result.elapsed,
  };
  for (let i = 0; i < expected.length; i++) {

    const score = {};
    const url = result.docs[i].url
    score.url = url;
    score.stats = result.stats[i];
    score.expected = expected[i];
    if (Object.keys(score.expected).length == 0) {
      throw 'No keys in expected answer';
    }
    score.actual = actual[i];
    score.correct = 0;
    score.total = 0;
    score.wrong = [];
    for (const key of Object.keys(score.expected)) {
      score.total++;
      if (score.expected[key] == score.actual[key]) {
        score.correct++;
      } else {
        score.wrong.push(key);
      }
    }
    out.scoreboard[cs.url].push(score);
  }

  out.overall = { total: 0, correct: 0 };
  for (let key of Object.keys(out.scoreboard)) {
    out.overall.total += out.scoreboard[key].reduce((acc, x) => acc + x.total, 0);
    out.overall.correct += out.scoreboard[key].reduce((acc, x) => acc + x.correct, 0);
  }

  fs.writeFileSync(filepath, JSON.stringify(out, null, 2), 'utf8');

  const agentsDir = './out/agents';
  const caseFiles = fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.json'))
    .filter(file => file != 'list.json');
  const listFilepath = path.join(agentsDir, 'list.json');
  fs.writeFileSync(listFilepath, JSON.stringify(caseFiles, null, 2), 'utf8');

  console.log(`File list saved to ${listFilepath}`);
}

main();
