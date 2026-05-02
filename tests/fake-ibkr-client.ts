import type { IbkrFlexClient, IbkrFlexStatement } from "../src/clients/ibkr";

export class FakeIbkrFlexClient implements IbkrFlexClient {
  private statements: Map<string, IbkrFlexStatement> = new Map();
  private error: string | null = null;

  setStatement(key: string, statement: IbkrFlexStatement) {
    this.statements.set(key, statement);
  }

  setError(message: string) {
    this.error = message;
  }

  async fetchStatement(token: string, queryId: string): Promise<IbkrFlexStatement> {
    if (this.error) throw new Error(this.error);
    const key = `${token}|${queryId}`;
    const statement = this.statements.get(key);
    if (!statement) throw new Error("No statement configured for this token/queryId");
    return statement;
  }
}
