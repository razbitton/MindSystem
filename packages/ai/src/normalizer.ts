import type { NormalizerOutput } from "@personal-context-os/shared";

export interface FreeTextNormalizer {
  normalize(input: {
    text: string;
    now?: Date;
    projectHint?: string;
  }): Promise<NormalizerOutput>;
}
