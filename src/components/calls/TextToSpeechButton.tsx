import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface TextToSpeechButtonProps {
  text: string;
  voiceId?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'secondary' | 'ghost' | 'outline';
  className?: string;
}

export function TextToSpeechButton({
  text,
  voiceId,
  size = 'icon',
  variant = 'ghost',
  className,
}: TextToSpeechButtonProps) {
  const { speak, stopAudio, isLoading, isPlaying } = useTextToSpeech({ voiceId });

  const handleClick = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      speak(text);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            disabled={isLoading}
            className={className}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isLoading ? 'Generating...' : isPlaying ? 'Stop audio' : 'Play audio'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
