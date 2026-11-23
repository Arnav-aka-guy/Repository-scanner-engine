import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={`inline-flex items-center gap-1 rounded-[6px] border border-[#222228] bg-[#0D0D10] p-1 text-[#9A9AA3] ${className}`}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className = '', children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={`inline-flex items-center justify-center whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12px] font-sans font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#35D7FF] disabled:pointer-events-none disabled:opacity-40 data-[state=active]:bg-[#18181C] data-[state=active]:text-[#F4F4F5] hover:text-[#F4F4F5] ${className}`}
    {...props}
  >
    {children}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={`mt-3 focus-visible:outline-none ${className}`}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
