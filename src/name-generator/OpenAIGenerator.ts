import OpenAI from "openai";
import { Engine } from "../template/engine";
import { readFile, readFileSync } from "fs";
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

  async generateName(ctxJson: string, currentSeries: string[]): Promise<{ seriesName?: string, videoName: string }> {
    let info: {
      seriesName?: string,
      videoName: string
    } | boolean = false;

    let tries = 0;
    while (!info && tries++ < maxTries ) {
      console.log("Generating info...")
      const response = await this.generatePrediction(ctxJson, currentSeries);
      info = await this.validateResponse(response);

      console.log("Generated response:", response, "info (found?):", info);
      if (info) return info;
    }

    throw new Error("Failed to generate info after " + maxTries + " tries. Please try again.")
  }

  private async generatePrediction(ctxJson: string, currentSeriesNames: string[]): Promise<string> {
    const p = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(p)
    
    const exampleCtx = readFileSync(__dirname + '/../res/openai_example_ctx.txt').toString()
    const exampleSeriesNames1 = readFileSync(__dirname + '/../res/openai_example_series_1.txt').toString()
    const exampleSeriesNames2 = readFileSync(__dirname + '/../res/openai_example_series_2.txt').toString()

    const exampleResponse1 = readFileSync(__dirname + '/../res/openai_example_bot_response_1.txt').toString() 
    const exampleResponse2 = readFileSync(__dirname + '/../res/openai_example_bot_response_2.txt').toString()

    const examplePrompt1 = this.engine.renderOpenAIPrompt({ctxJson: exampleCtx, seriesNames: exampleSeriesNames1})
    const examplePrompt2 = this.engine.renderOpenAIPrompt({ctxJson: exampleCtx, seriesNames: exampleSeriesNames2})
    const prompt = this.engine.renderOpenAIPrompt({ctxJson, seriesNames: JSON.stringify(currentSeriesNames)})

    const completion = await this.openAI.chat.completions.create({
      messages: [
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
          content: prompt
        }
      ],
      model: this.config.engine,
    });

    return completion.choices[0].message.content;
  }

  private async validateResponse(response: string): Promise<{
    seriesName?: string,
    videoName: string
  }> {
    const seriesNameRegex = /SERIES_NAME: "?\w+"?/;
    const videoSeriesNameRegex = /TITLE: "?\w+\d{1,4}"?/;
    const movieNameRegex = /TITLE: "?\w+"?/;
    
    const seriesNameMatches = response.match(seriesNameRegex);
    const videoSeriesNameMatches = response.match(videoSeriesNameRegex);
    const movieNameMatches = response.match(movieNameRegex);

    if(seriesNameMatches?.length && videoSeriesNameMatches?.length) {
      // video is an episode of a series
      return {
        seriesName: seriesNameMatches[0].split(' ')[1].replace(/"/g, ''),
        videoName: videoSeriesNameMatches[0].split(' ')[1].replace(/"/g, '')
      }
    } else if(movieNameMatches?.length) {
      // video is a movie
      return {
        videoName: movieNameMatches[0].split(' ')[1].replace(/"/g, '')
      }
    }

    return undefined
  }
}
