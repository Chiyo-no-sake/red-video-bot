import OpenAI from "openai";
import { Engine } from "../template/engine";
import { readFileSync } from "fs";
import { encode } from "gpt-3-encoder";
import { fileURLToPath } from "url";
import path from "path";

const maxTries = 3;

export type OpenAIConfig = {
  apiKey: string;
  engine: 'gpt-3.5-turbo' | 'gpt-4';
};

export class OpenAIGenerator {
  private readonly openAI = new OpenAI({ apiKey: this.config.apiKey });

  constructor(private readonly config: OpenAIConfig, private readonly engine: Engine) {}

  async generateName(ctxJson: string, seriesName: string | undefined): Promise<string> {
    let name: string | undefined;

    let tries = 0;
    while (!name && tries++ < maxTries ) {
      console.log("Generating info...")
      const response = await this.generatePrediction(ctxJson, seriesName);
      name = await this.validateResponse(seriesName, response);

      console.log("Generated response:", response, "name (found?):", name);
      if (name) return name;
    }

    throw new Error("Failed to generate info after " + maxTries + " tries. Please try again.")
  }

  private async generatePrediction(ctxJson: string, seriesName: string | undefined): Promise<string> {
    const prompt = this.engine.renderOpenAIPrompt({ctxJson, seriesName, videoType: seriesName ? 'series' : 'movie'})
    const examples = this.getExamples();
    const chatEncoded = encode(examples.reduce((acc, curr) => acc + curr.content, '') + prompt);
    const len = chatEncoded.length;

    let model = this.config.engine;
    if(len >= 4000) {
      model += "-16k";
    }

    const completion = await this.openAI.chat.completions.create({
      messages: [
        ...examples,
        { 
          role: 'user', 
          content: prompt
        },
      ],
      model,
    });

    return completion.choices[0].message.content || '';
  }

  private async validateResponse(seriesName: string | undefined, response: string): Promise<string | undefined> {
    let videoNameRegex = /TITLE: ".*"/g;

    if (seriesName) {
      videoNameRegex = /TITLE: "S?\d*E\d+"/g;
    }
    
    const videoNameMatches = response.match(videoNameRegex);
    if(videoNameMatches?.length) {
      return videoNameMatches[0].split('TITLE: ')[1].replace(/"/g, '');
    }

    return undefined
  }

  getExamples(): {role: 'user' | 'assistant', content: string}[] {
    const p = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(p)

    const exampleCtx1 = readFileSync(__dirname + '/../res/openai_example_ctx_1.txt').toString()
    const exampleCtx2 = readFileSync(__dirname + '/../res/openai_example_ctx_2.txt').toString()
    const exampleCtxFilm = readFileSync(__dirname + '/../res/openai_example_ctx_film.txt').toString()
    const exampleSeriesNames1 = readFileSync(__dirname + '/../res/openai_example_series_1.txt').toString()
    const exampleSeriesNames2 = readFileSync(__dirname + '/../res/openai_example_series_2.txt').toString()

    const exampleResponse1 = readFileSync(__dirname + '/../res/openai_example_bot_response_1.txt').toString() 
    const exampleResponse2 = readFileSync(__dirname + '/../res/openai_example_bot_response_2.txt').toString()
    const exampleResponseFilm = readFileSync(__dirname + '/../res/openai_example_bot_response_film.txt').toString()

    const examplePrompt1 = this.engine.renderOpenAIPrompt({ctxJson: exampleCtx1, seriesName: 'One_Piece', videoType: 'series'})
    const examplePrompt2 = this.engine.renderOpenAIPrompt({ctxJson: exampleCtx2, seriesName: 'L_Attacco_Dei_Giganti', videoType: 'series'})
    const examplePromptFilm = this.engine.renderOpenAIPrompt({ctxJson: exampleCtxFilm, seriesName: undefined, videoType: 'movie'})

    return [
      {
        role: 'user',
        content: examplePrompt1
      },
      {
        role: 'assistant',
        content: exampleResponse1
      },
      {
        role: 'user',
        content: examplePrompt2
      },
      {
        role: 'assistant',
        content: exampleResponse2
      },
      {
        role: 'user',
        content: examplePromptFilm
      },
      {
        role: 'assistant',
        content: exampleResponseFilm
      }
    ]
  }
}
