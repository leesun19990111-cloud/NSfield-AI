export const FAMILY_LABEL: Record<string, string> = {
  nanobanana: 'Nano Banana',
  seedream: 'Seedream',
  'veo3.1': 'Veo 3.1',
  seedance: 'Seedance',
  kling: 'Kling',
  openai: 'GPT Image',
}

export const MODALITY_LABEL: Record<string, string> = {
  'text-to-image': '텍스트→이미지',
  'reference-to-image': '참조→이미지',
  'text-to-video': '텍스트→영상',
  'image-to-video': '이미지→영상',
  'reference-to-video': '참조→영상',
}

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family
}

export function modalityLabel(modality: string): string {
  return MODALITY_LABEL[modality] ?? modality
}
