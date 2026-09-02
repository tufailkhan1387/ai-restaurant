import { useState, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

interface CallResult {
  success: boolean;
  callSid?: string;
  status?: string;
  to?: string;
  from?: string;
  error?: string;
}

interface CallStatus {
  callSid: string;
  status: string;
  direction: string;
  duration: string | null;
  startTime: string | null;
  endTime: string | null;
  to: string;
  from: string;
}

interface SmsResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  to?: string;
  error?: string;
}

export function useTwilio() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);

  const makeCall = useCallback(async (
    to: string, 
    message?: string, 
    voiceId?: string
  ): Promise<CallResult> => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`${getApiBase()}/api/functions/twilio-make-call`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ to, message, voiceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to make call');
      }

      setActiveCallSid(data.callSid);
      
      toast({
        title: 'Call Initiated',
        description: `Calling ${to}...`,
      });

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to make call';
      toast({
        variant: 'destructive',
        title: 'Call Failed',
        description: message,
      });
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCallStatus = useCallback(async (callSid: string): Promise<CallStatus | null> => {
    try {
      const response = await fetch(`${getApiBase()}/api/functions/twilio-call-status`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ callSid }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get call status');
      }

      return data;
    } catch (error) {
      console.error('Get call status error:', error);
      return null;
    }
  }, []);

  const endCall = useCallback(async (callSid?: string): Promise<boolean> => {
    const sid = callSid || activeCallSid;
    
    if (!sid) {
      toast({
        variant: 'destructive',
        title: 'No Active Call',
        description: 'No call to end',
      });
      return false;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch(`${getApiBase()}/api/functions/twilio-end-call`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ callSid: sid }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to end call');
      }

      setActiveCallSid(null);
      
      toast({
        title: 'Call Ended',
        description: 'The call has been terminated.',
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end call';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeCallSid]);

  const sendSms = useCallback(async (to: string, body: string): Promise<SmsResult> => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`${getApiBase()}/api/functions/twilio-send-sms`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ to, body }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      toast({
        title: 'SMS Sent',
        description: `Message sent to ${to}`,
      });

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send SMS';
      toast({
        variant: 'destructive',
        title: 'SMS Failed',
        description: message,
      });
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    makeCall,
    getCallStatus,
    endCall,
    sendSms,
    isLoading,
    activeCallSid,
  };
}
