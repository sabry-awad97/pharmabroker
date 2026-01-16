/**
 * Test Suites
 *
 * Pre-defined test suites for evaluating AI extraction capabilities.
 */

import type { TestSuite } from '../types';

// ============================================================================
// Basic Text Understanding
// ============================================================================

export const basicTextSuite: TestSuite = {
  name: 'Basic Text Understanding',
  description: 'Tests basic text comprehension and response generation',
  cases: [
    {
      id: 'basic-greeting',
      name: 'Simple Greeting',
      input: {
        text: 'Hola, buenos días',
        senderName: 'Juan',
        groupName: 'Farmacia Central',
      },
      tags: ['greeting', 'spanish'],
    },
    {
      id: 'basic-question',
      name: 'Simple Question',
      input: {
        text: '¿Tienen paracetamol disponible?',
        senderName: 'María',
        groupName: 'Farmacia Central',
      },
      tags: ['question', 'product-inquiry', 'spanish'],
    },
    {
      id: 'basic-order',
      name: 'Simple Order',
      input: {
        text: 'Necesito 2 cajas de ibuprofeno 400mg',
        senderName: 'Carlos',
        groupName: 'Pedidos Mayoristas',
      },
      tags: ['order', 'spanish'],
    },
  ],
};

// ============================================================================
// Order Extraction
// ============================================================================

export const orderExtractionSuite: TestSuite = {
  name: 'Order Extraction',
  description: 'Tests extraction of order details from messages',
  cases: [
    {
      id: 'order-single-item',
      name: 'Single Item Order',
      input: {
        text: 'Quiero pedir 10 cajas de aspirina 500mg',
        senderName: 'Pedro',
        groupName: 'Pedidos',
      },
      expected: [
        {
          type: 'order',
          data: {
            items: [{ name: 'aspirina 500mg', quantity: 10, unit: 'cajas' }],
          },
        },
      ],
      tags: ['order', 'single-item'],
    },
    {
      id: 'order-multiple-items',
      name: 'Multiple Items Order',
      input: {
        text: 'Necesito: 5 cajas de paracetamol, 3 frascos de jarabe para la tos, y 2 cajas de vendas',
        senderName: 'Ana',
        groupName: 'Pedidos Mayoristas',
      },
      expected: [
        {
          type: 'order',
          data: {
            items: [
              { name: 'paracetamol', quantity: 5 },
              { name: 'jarabe para la tos', quantity: 3 },
              { name: 'vendas', quantity: 2 },
            ],
          },
        },
      ],
      tags: ['order', 'multiple-items'],
    },
    {
      id: 'order-with-urgency',
      name: 'Urgent Order',
      input: {
        text: 'URGENTE: Necesito 20 unidades de insulina para hoy antes de las 3pm',
        senderName: 'Dr. García',
        groupName: 'Pedidos Urgentes',
      },
      expected: [
        {
          type: 'order',
          data: {
            items: [{ name: 'insulina', quantity: 20 }],
          },
        },
        {
          type: 'intent',
          data: {
            intent: 'urgent_order',
          },
        },
      ],
      tags: ['order', 'urgent'],
    },
    {
      id: 'order-with-delivery',
      name: 'Order with Delivery Instructions',
      input: {
        text: 'Pedido para mañana: 15 cajas de omeprazol. Entregar en Av. Principal 123, preguntar por Rosa.',
        senderName: 'Farmacia Norte',
        groupName: 'Distribuidores',
      },
      tags: ['order', 'delivery'],
    },
  ],
};

// ============================================================================
// Intent Classification
// ============================================================================

export const intentClassificationSuite: TestSuite = {
  name: 'Intent Classification',
  description: 'Tests classification of user intents',
  cases: [
    {
      id: 'intent-inquiry',
      name: 'Product Inquiry',
      input: {
        text: '¿Cuál es el precio del paracetamol de 500mg?',
        senderName: 'Cliente',
        groupName: 'Consultas',
      },
      expected: [
        {
          type: 'intent',
          data: { intent: 'price_inquiry' },
          minConfidence: 0.7,
        },
      ],
      tags: ['intent', 'inquiry'],
    },
    {
      id: 'intent-complaint',
      name: 'Complaint',
      input: {
        text: 'El pedido llegó incompleto, faltan 3 cajas de lo que pedí. Esto es inaceptable.',
        senderName: 'Cliente Molesto',
        groupName: 'Reclamos',
      },
      expected: [
        {
          type: 'intent',
          data: { intent: 'complaint' },
          minConfidence: 0.8,
        },
        {
          type: 'sentiment',
          data: { sentiment: 'negative' },
        },
      ],
      tags: ['intent', 'complaint', 'negative'],
    },
    {
      id: 'intent-availability',
      name: 'Availability Check',
      input: {
        text: '¿Tienen disponible la vacuna contra la gripe?',
        senderName: 'Paciente',
        groupName: 'Consultas',
      },
      expected: [
        {
          type: 'intent',
          data: { intent: 'availability_check' },
        },
      ],
      tags: ['intent', 'availability'],
    },
    {
      id: 'intent-support',
      name: 'Support Request',
      input: {
        text: 'Necesito ayuda con mi cuenta, no puedo ver mis pedidos anteriores',
        senderName: 'Usuario',
        groupName: 'Soporte',
      },
      expected: [
        {
          type: 'intent',
          data: { intent: 'support_request' },
        },
      ],
      tags: ['intent', 'support'],
    },
  ],
};

// ============================================================================
// Sentiment Analysis
// ============================================================================

export const sentimentAnalysisSuite: TestSuite = {
  name: 'Sentiment Analysis',
  description: 'Tests sentiment detection in messages',
  cases: [
    {
      id: 'sentiment-positive',
      name: 'Positive Sentiment',
      input: {
        text: '¡Excelente servicio! El pedido llegó antes de lo esperado y todo perfecto. Muchas gracias.',
        senderName: 'Cliente Feliz',
        groupName: 'Feedback',
      },
      expected: [
        {
          type: 'sentiment',
          data: { sentiment: 'positive' },
          minConfidence: 0.8,
        },
      ],
      tags: ['sentiment', 'positive'],
    },
    {
      id: 'sentiment-negative',
      name: 'Negative Sentiment',
      input: {
        text: 'Pésimo servicio, llevo esperando 3 días y nadie me da respuesta. No vuelvo a comprar aquí.',
        senderName: 'Cliente Insatisfecho',
        groupName: 'Reclamos',
      },
      expected: [
        {
          type: 'sentiment',
          data: { sentiment: 'negative' },
          minConfidence: 0.8,
        },
      ],
      tags: ['sentiment', 'negative'],
    },
    {
      id: 'sentiment-neutral',
      name: 'Neutral Sentiment',
      input: {
        text: 'Confirmo recepción del pedido #12345. Cantidad correcta.',
        senderName: 'Almacén',
        groupName: 'Logística',
      },
      expected: [
        {
          type: 'sentiment',
          data: { sentiment: 'neutral' },
        },
      ],
      tags: ['sentiment', 'neutral'],
    },
  ],
};

// ============================================================================
// Entity Extraction
// ============================================================================

export const entityExtractionSuite: TestSuite = {
  name: 'Entity Extraction',
  description: 'Tests extraction of named entities from messages',
  cases: [
    {
      id: 'entity-product',
      name: 'Product Entities',
      input: {
        text: 'Busco Losartán 50mg y Metformina 850mg para tratamiento de hipertensión y diabetes',
        senderName: 'Paciente',
        groupName: 'Consultas',
      },
      expected: [
        {
          type: 'entities',
          data: {
            entities: [
              { type: 'medication', value: 'Losartán 50mg' },
              { type: 'medication', value: 'Metformina 850mg' },
              { type: 'condition', value: 'hipertensión' },
              { type: 'condition', value: 'diabetes' },
            ],
          },
        },
      ],
      tags: ['entities', 'medical'],
    },
    {
      id: 'entity-contact',
      name: 'Contact Entities',
      input: {
        text: 'Mi nombre es Juan Pérez, mi teléfono es 555-1234 y mi correo juan@email.com',
        senderName: 'Juan',
        groupName: 'Registro',
      },
      expected: [
        {
          type: 'entities',
          data: {
            entities: [
              { type: 'person', value: 'Juan Pérez' },
              { type: 'phone', value: '555-1234' },
              { type: 'email', value: 'juan@email.com' },
            ],
          },
        },
      ],
      tags: ['entities', 'contact'],
    },
    {
      id: 'entity-location',
      name: 'Location Entities',
      input: {
        text: 'Entregar en Calle Principal 456, Colonia Centro, Ciudad de México, CP 06000',
        senderName: 'Cliente',
        groupName: 'Entregas',
      },
      expected: [
        {
          type: 'entities',
          data: {
            entities: [
              { type: 'address', value: 'Calle Principal 456' },
              { type: 'city', value: 'Ciudad de México' },
            ],
          },
        },
      ],
      tags: ['entities', 'location'],
    },
  ],
};

// ============================================================================
// Complex Scenarios
// ============================================================================

export const complexScenariosSuite: TestSuite = {
  name: 'Complex Scenarios',
  description: 'Tests handling of complex, multi-intent messages',
  cases: [
    {
      id: 'complex-order-complaint',
      name: 'Order with Complaint',
      input: {
        text: 'El último pedido llegó mal, pero necesito hacer otro pedido urgente: 10 cajas de amoxicilina y 5 de azitromicina. Por favor asegúrense de que esta vez llegue completo.',
        senderName: 'Dr. Martínez',
        groupName: 'Pedidos Clínica',
      },
      tags: ['complex', 'order', 'complaint'],
    },
    {
      id: 'complex-inquiry-order',
      name: 'Inquiry then Order',
      input: {
        text: '¿Tienen disponible el medicamento X? Si sí, quiero pedir 20 unidades. Si no, ¿cuándo llega?',
        senderName: 'Farmacia',
        groupName: 'Distribuidores',
      },
      tags: ['complex', 'inquiry', 'conditional-order'],
    },
    {
      id: 'complex-multilingual',
      name: 'Mixed Language',
      input: {
        text: 'Need 50 boxes of paracetamol ASAP. También necesito cotización para ibuprofeno bulk.',
        senderName: 'International Client',
        groupName: 'Export',
      },
      tags: ['complex', 'multilingual'],
    },
  ],
};

// ============================================================================
// All Suites
// ============================================================================

export const allSuites: TestSuite[] = [
  basicTextSuite,
  orderExtractionSuite,
  intentClassificationSuite,
  sentimentAnalysisSuite,
  entityExtractionSuite,
  complexScenariosSuite,
];

/** Get a test suite by name */
export function getSuite(name: string): TestSuite | undefined {
  return allSuites.find(s => s.name.toLowerCase() === name.toLowerCase());
}

/** Get all test cases with a specific tag */
export function getCasesByTag(tag: string): TestSuite {
  const cases = allSuites.flatMap(suite =>
    suite.cases.filter(c => c.tags?.includes(tag)),
  );
  return {
    name: `Tag: ${tag}`,
    description: `All test cases with tag "${tag}"`,
    cases,
  };
}
