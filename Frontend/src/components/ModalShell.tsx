import { AnimatePresence, motion } from 'motion/react';
import { overlayVariants, modalVariants } from '../lib/motion';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}

export function ModalShell({
  isOpen,
  onClose,
  maxWidth = 'max-w-lg',
  children,
}: ModalShellProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className={`card-premium w-full ${maxWidth} shadow-2xl overflow-hidden`}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={e => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
