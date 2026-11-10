package eu.demo;

@RestController
@RequestMapping("/orders")
public class OrderController {
  private final OrderService service;

  public OrderController(OrderService service) {
    this.service = service;
  }

  @GetMapping("/{id}")
  public Order get(String id) {
    return service.find(id);
  }
}
