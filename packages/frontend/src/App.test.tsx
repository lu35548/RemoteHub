import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App 冒烟', () => {
  it('渲染 RemoteHub V2 标识', () => {
    render(<App />);
    expect(screen.getByText('RemoteHub V2')).toBeInTheDocument();
  });
});
