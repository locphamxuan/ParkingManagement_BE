jest.mock('../../src/models/operations/Feedback', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../src/utils/response', () => ({
  sendSuccess: jest.fn(),
}));

const Feedback = require('../../src/models/operations/Feedback');
const { sendSuccess } = require('../../src/utils/response');
const { createFeedback } = require('../../src/controllers/user/feedback.controller');

const flushAsyncHandler = () => new Promise((resolve) => setImmediate(resolve));

describe('createFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Feedback.findOne.mockResolvedValue(null);
    Feedback.create.mockResolvedValue({ _id: 'feedback-1' });
  });

  it('persists optional feedback image URLs', async () => {
    const next = jest.fn();
    createFeedback({
      user: { _id: 'user-1' },
      body: {
        parkingSession: 'session-1',
        building: 'building-1',
        rating: 5,
        comment: 'Great experience',
        portraitImageUrl: 'https://cdn.example.com/portrait.jpg',
        plateImageUrl: 'https://cdn.example.com/plate.jpg',
      },
    }, {}, next);
    await flushAsyncHandler();

    expect(next).not.toHaveBeenCalled();
    expect(Feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      portraitImageUrl: 'https://cdn.example.com/portrait.jpg',
      plateImageUrl: 'https://cdn.example.com/plate.jpg',
    }));
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { feedback: { _id: 'feedback-1' } } }),
      201,
    );
  });

  it('rejects a non-HTTP image URL', async () => {
    const next = jest.fn();
    createFeedback({
      user: { _id: 'user-1' },
      body: {
        parkingSession: 'session-1',
        rating: 5,
        comment: 'Great experience',
        portraitImageUrl: 'file:///private/image.jpg',
      },
    }, {}, next);
    await flushAsyncHandler();

    expect(Feedback.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'portraitImageUrl must be a valid HTTP(S) URL',
      statusCode: 400,
    }));
  });
});
