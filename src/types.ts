export interface ImageItem {
  id: string;
  url: string;
  title: string;
  author: string;
  category: string;
  description: string;
  location?: string;
  timestamp?: number;
  isVideo?: boolean;
  videoUrl?: string;
}

export type CarouselMode = 'scroll' | 'animate';
