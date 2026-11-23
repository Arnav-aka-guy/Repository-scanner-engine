import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  className?: string;
  children: React.ReactNode;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className = '', children, ...props }, ref) => (
  <>
    <DialogPrimitive.Overlay asChild>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[3px]"
      />
    </DialogPrimitive.Overlay>
    <DialogPrimitive.Content asChild ref={ref} {...props}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[540px] translate-x-[-50%] translate-y-[-50%] rounded-[16px] border border-line-strong bg-surface p-6 text-fg shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-y-auto focus:outline-none ${className}`}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X size={16} />
        </DialogPrimitive.Close>
      </motion.div>
    </DialogPrimitive.Content>
  </>
));
DialogContent.displayName = 'DialogContent';

export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    className={`flex flex-col space-y-1.5 text-left pb-2 mb-4 ${className}`}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-[18px] font-semibold tracking-[-0.01em] text-fg ${className}`}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-[13.5px] leading-relaxed text-fg-3 ${className}`}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
