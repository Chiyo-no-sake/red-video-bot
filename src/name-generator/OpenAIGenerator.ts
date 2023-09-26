import OpenAI from "openai";


export type OpenAIConfig = {
  apiKey: string;
  engine: 'gpt-3.5-turbo' | 'gpt-4';
};

export class OpenAIGenerator {

  private readonly openAI = new OpenAI({ apiKey: this.config.apiKey });

  constructor(private readonly config: OpenAIConfig) {}


  async generateName(ctxJson: string): Promise<string> {
    let name: string | boolean = false;

    while (!name) {
      console.log("Generating name...")
      const response = await this.generateNameOnce(ctxJson);
      name = await this.confirmName(response);

      console.log("Generated response:", response, "name (found):", name);
      if (name) return name;
    }
  }

  private async generateNameOnce(ctxJson: string): Promise<string> {
    const completion = await this.openAI.chat.completions.create({
      messages: [
        {role: 'user', content: "The following is an example of a \"ctx\" object from my telegram bot:\n" + ctxJson + "\n\n"+ 
        "Generate a file name based on that for a tv series episode with the following format (without quotes): \"One_Piece_<EPISODE_NUMBER>\". Example of your answer: \"One_Piece_001\""},
      ],
      model: this.config.engine,
    });

    return completion.choices[0].message.content;
  }

  private async confirmName(name: string): Promise<string | false> {
    const regex = /One_Piece_\d{1,4}/;
    const matches = name.match(regex);
    if (matches === null) return false;

    return matches[0];
  }
}