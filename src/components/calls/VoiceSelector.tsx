import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ELEVENLABS_VOICES, VoiceId } from '@/hooks/useTextToSpeech';

interface VoiceSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function VoiceSelector({ value, onValueChange, className }: VoiceSelectorProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select a voice" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ELEVENLABS_VOICES).map(([key, voice]) => (
          <SelectItem key={key} value={voice.id}>
            <div className="flex flex-col">
              <span>{voice.name}</span>
              <span className="text-xs text-muted-foreground">{voice.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
